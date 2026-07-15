import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Camera,
  ImagePlus,
  RefreshCcw,
  Search,
  Settings,
  WifiOff
} from "lucide-react";
import "./styles.css";
import { loadBoardState, saveBoardState, uploadMemberImage } from "./firebaseStorage";
import { getStoredState, saveStoredState, syncRecords } from "./recordSync";

const tabs = [
  { id: "members", label: "メンバー" },
  { id: "times", label: "種目" },
  { id: "meets", label: "大会一覧" }
];
const CARD_CROP_ASPECT = 1;
const NAME_READING_PARTS = [
  ["森川", "もりかわ"],
  ["結芽", "ゆめ"]
];

function App() {
  const [activeTab, setActiveTab] = useState("members");
  const [state, setState] = useState(() => getStoredState());
  const [query, setQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDockHidden, setIsDockHidden] = useState(false);
  const swipeStartRef = useRef(null);

  const filteredRecords = useMemo(() => {
    const needle = normalizeSearchText(query);
    if (!needle) return state.recentResults;
    return state.recentResults.filter((record) => buildRecordSearchText(record, state.memberReadings || {}).includes(needle));
  }, [query, state.recentResults, state.memberReadings]);

  async function handleSync({ silent = false } = {}) {
    if (!silent) setIsSyncing(true);
    setError("");
    try {
      const nextState = await syncRecords(state);
      setState(nextState);
      await persistState(nextState);
    } catch (syncError) {
      setError(syncError.message);
    } finally {
      if (!silent) setIsSyncing(false);
    }
  }

  function updateState(patch) {
    const nextState = { ...state, ...patch };
    setState(nextState);
    persistState(nextState);
  }

  async function persistState(nextState) {
    saveStoredState(nextState);
    try {
      await saveBoardState(nextState);
    } catch {
    }
  }

  function handleArchiveToggle(memberName) {
    const archivedMembers = state.archivedMembers || [];
    const nextArchivedMembers = archivedMembers.includes(memberName)
      ? archivedMembers.filter((name) => name !== memberName)
      : [...archivedMembers, memberName];
    updateState({ archivedMembers: nextArchivedMembers });
  }

  function handlePhotoUpdate(memberName, photoUrl) {
    updateState({
      memberPhotos: {
        ...(state.memberPhotos || {}),
        [memberName]: photoUrl
      }
    });
  }

  function handleReadingUpdate(memberName, reading) {
    updateState({
      memberReadings: {
        ...(state.memberReadings || {}),
        [memberName]: reading
      }
    });
  }

  function moveActiveTab(direction) {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    const nextIndex = clamp(currentIndex + direction, 0, tabs.length - 1);
    if (nextIndex !== currentIndex) setActiveTab(tabs[nextIndex].id);
  }

  function handleSwipeStart(event) {
    if (event.pointerType === "mouse" || event.target.closest("button,input,select,textarea,a,.tabs,.controls,.memberFilterBar,.eventFilterBar,.meetModeTabs,.modalBackdrop")) {
      swipeStartRef.current = null;
      return;
    }
    swipeStartRef.current = {
      x: event.clientX,
      y: event.clientY
    };
  }

  function handleSwipeEnd(event) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    moveActiveTab(dx < 0 ? 1 : -1);
  }

  useEffect(() => {
    let cancelled = false;
    loadBoardState()
      .then((cloudState) => {
        if (cancelled) return;
        if (cloudState) {
          const localState = getStoredState();
          const mergedState = {
            ...localState,
            ...cloudState,
            settings: { ...localState.settings, ...(cloudState.settings || {}) },
            upcomingMeets: cloudState.upcomingMeets || localState.upcomingMeets || []
          };
          setState(mergedState);
          saveStoredState(mergedState);
        }
        handleSync({ silent: true });
      })
      .catch(() => {
        if (!cancelled) {
          handleSync({ silent: true });
        }
      });
    const interval = window.setInterval(() => handleSync({ silent: true }), state.settings.refreshMinutes * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [state.settings.refreshMinutes]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js");
    }
  }, []);

  useEffect(() => {
    let showTimer = 0;
    function handleScroll() {
      setIsDockHidden(true);
      window.clearTimeout(showTimer);
      showTimer = window.setTimeout(() => setIsDockHidden(false), 260);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.clearTimeout(showTimer);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <main
      className={`app tab-${activeTab} ${isDockHidden ? "dockHidden" : ""}`}
      onPointerDown={handleSwipeStart}
      onPointerUp={handleSwipeEnd}
      onPointerCancel={() => {
        swipeStartRef.current = null;
      }}
    >
      {error ? (
        <div className="notice" role="status">
          <WifiOff size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      {activeTab !== "times" ? (
        <div className="controls">
          <label className="searchBox">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="選手名・大会名で検索" />
          </label>
          <button className="syncButton compactSyncButton" onClick={() => handleSync()} disabled={isSyncing}>
            <RefreshCcw size={16} className={isSyncing ? "spin" : ""} />
            <span>{isSyncing ? "更新中" : "更新"}</span>
          </button>
          <button className="settingsButton" onClick={() => setSettingsOpen(true)} aria-label="設定">
            <Settings size={16} />
          </button>
        </div>
      ) : null}

      <nav className="tabs" aria-label="画面切り替え">
        {tabs.map((tab) => {
          return (
            <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {activeTab === "members" ? (
        <MembersView
          records={filteredRecords}
          archivedMembers={state.archivedMembers || []}
          memberPhotos={state.memberPhotos || {}}
          memberReadings={state.memberReadings || {}}
          onArchiveToggle={handleArchiveToggle}
          onPhotoUpdate={handlePhotoUpdate}
          onReadingUpdate={handleReadingUpdate}
        />
      ) : null}
      {activeTab === "times" ? (
        <TimesView
          records={state.recentResults}
          memberPhotos={state.memberPhotos || {}}
          memberReadings={state.memberReadings || {}}
          archivedMembers={state.archivedMembers || []}
          onArchiveToggle={handleArchiveToggle}
          onPhotoUpdate={handlePhotoUpdate}
          onReadingUpdate={handleReadingUpdate}
        />
      ) : null}
      {activeTab === "meets" ? <MeetsView records={filteredRecords} upcomingMeets={state.upcomingMeets || []} query={query} /> : null}
      {settingsOpen ? (
        <SettingsModal
          records={state.recentResults}
          archivedMembers={state.archivedMembers || []}
          memberPhotos={state.memberPhotos || {}}
          memberReadings={state.memberReadings || {}}
          onArchiveToggle={handleArchiveToggle}
          onPhotoUpdate={handlePhotoUpdate}
          onReadingUpdate={handleReadingUpdate}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </main>
  );
}

function MembersView({ records, archivedMembers, memberPhotos, memberReadings, onArchiveToggle, onPhotoUpdate, onReadingUpdate }) {
  const [selectedMember, setSelectedMember] = useState(null);
  const [uploadMember, setUploadMember] = useState(null);
  const [readingMember, setReadingMember] = useState(null);
  const [genderFilters, setGenderFilters] = useState([]);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [sortMode, setSortMode] = useState("class");
  const [seenMemberUpdates, setSeenMemberUpdates] = useState(() => readSeenMemberUpdates());
  const latestRecordDate = useMemo(() => getLatestDate(records), [records]);
  const allMembers = useMemo(
    () =>
      buildMemberCards(records, memberPhotos, memberReadings)
        .filter((member) => !archivedMembers.includes(member.name))
        .map((member) => {
          const latestRecords = latestRecordDate ? member.records.filter((record) => record.date === latestRecordDate) : [];
          const isSeen = seenMemberUpdates.includes(`${member.name}:${latestRecordDate}`);
          return {
            ...member,
            hasUpdate: latestRecords.length > 0 && !isSeen,
            hasBestUpdate: latestRecords.some((record) => isEventBest(member.records, record)) && !isSeen
          };
        }),
    [records, memberPhotos, memberReadings, archivedMembers, latestRecordDate, seenMemberUpdates]
  );
  const filterOptions = useMemo(() => buildMemberFilterOptions(allMembers), [allMembers]);
  const members = sortMembers(
    allMembers.filter((member) => {
      if (genderFilters.length && !genderFilters.includes(member.gender)) return false;
      if (gradeFilter !== "all" && member.grade !== gradeFilter) return false;
      if (classFilter !== "all" && member.swimClass !== classFilter) return false;
      return true;
    }),
    sortMode
  );

  function handleOpenMember(member) {
    if (member.hasUpdate && latestRecordDate) {
      const nextSeen = Array.from(new Set([...seenMemberUpdates, `${member.name}:${latestRecordDate}`]));
      setSeenMemberUpdates(nextSeen);
      saveSeenMemberUpdates(nextSeen);
    }
    setSelectedMember(member);
  }

  return (
    <>
      <section className="memberFilterBar" aria-label="メンバー絞り込み">
        <div className="genderToggle" aria-label="性別">
          {["男子", "女子"].map((gender) => (
            <button
              key={gender}
              className={genderFilters.includes(gender) ? "active" : ""}
              onClick={() => {
                setGenderFilters((current) => {
                  if (current.includes(gender)) return current.filter((value) => value !== gender);
                  return [...current, gender];
                });
              }}
            >
              {gender === "男子" ? "男" : "女"}
            </button>
          ))}
        </div>
        <label>
          <span className="inlineFilterLabel">学年</span>
          <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}>
            <option value="all">すべて</option>
            {filterOptions.grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>
        </label>
        <label>
          <span className="inlineFilterLabel">級</span>
          <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
            <option value="all">すべて</option>
            {filterOptions.classes.map((swimClass) => <option key={swimClass} value={swimClass}>{swimClass}</option>)}
          </select>
        </label>
        <button
          className={`sortInlineButton ${sortMode === "class" ? "classSort" : "gradeSort"}`}
          onClick={() => setSortMode((current) => (current === "grade" ? "class" : "grade"))}
        >
          {sortMode === "grade" ? "学年順" : "級順"}
        </button>
      </section>
      <section className="memberGrid" aria-label="メンバー">
        {members.map((member) => (
          <MemberCard
            key={member.name}
            member={member}
            onClick={() => handleOpenMember(member)}
            onArchive={() => onArchiveToggle(member.name)}
            onPhotoRequest={() => setUploadMember(member)}
            onReadingRequest={() => setReadingMember(member)}
          />
        ))}
      </section>
      {members.length === 0 ? <EmptyState title="表示中の選手がいません" text="設定からアーカイブ済み選手を戻すと表示されます。" /> : null}
      {selectedMember ? (
        <MemberModal
          member={selectedMember}
          isArchived={archivedMembers.includes(selectedMember.name)}
          onArchiveToggle={onArchiveToggle}
          onPhotoUpdate={onPhotoUpdate}
          onReadingUpdate={onReadingUpdate}
          onClose={() => setSelectedMember(null)}
        />
      ) : null}
      {uploadMember ? (
        <PhotoUploadModal
          memberName={uploadMember.name}
          currentPhotoUrl={uploadMember.photoUrl}
          onSaved={(photoUrl) => {
            onPhotoUpdate(uploadMember.name, photoUrl);
            setUploadMember(null);
          }}
          onDelete={() => {
            onPhotoUpdate(uploadMember.name, "");
            setUploadMember(null);
          }}
          onClose={() => setUploadMember(null)}
        />
      ) : null}
      {readingMember ? (
        <ReadingEditModal
          member={readingMember}
          onReadingUpdate={onReadingUpdate}
          onClose={() => setReadingMember(null)}
        />
      ) : null}
    </>
  );
}

function MemberCard({ member, onClick, onArchive, onPhotoRequest, onReadingRequest }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);

  function clearLongPress() {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function openMenu() {
    longPressTriggered.current = true;
    setMenuOpen(true);
  }

  function handlePointerDown() {
    longPressTriggered.current = false;
    clearLongPress();
    longPressTimer.current = window.setTimeout(openMenu, 520);
  }

  function handlePointerEnd() {
    clearLongPress();
  }

  function handleClick(event) {
    if (longPressTriggered.current || menuOpen) {
      event.preventDefault();
      longPressTriggered.current = false;
      return;
    }
    onClick();
  }

  return (
    <div className="memberCardWrap">
      <button
        className={`memberCard ${member.photoUrl ? "hasPhoto" : ""}`}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onContextMenu={(event) => {
          event.preventDefault();
          openMenu();
        }}
      >
        {member.photoUrl ? <img src={member.photoUrl} alt="" /> : null}
        <div className="memberOverlay">
          {member.hasUpdate ? <span className="updateDot" aria-label="更新あり" /> : null}
          {member.hasBestUpdate ? <span className="bestUpdateBadge">ベスト更新</span> : null}
          {member.reading ? <p className="memberReading">{member.reading}</p> : null}
          <h2>{member.name}</h2>
          <div className="memberFacts">
            <span className={`factChip ${genderClassName(member.gender)}`}>{member.gender || "性別未取得"}</span>
            <span className="factChip gradeChip">{member.grade || "学年未取得"}</span>
            <span className="factChip classChip">{member.swimClass || "級未取得"}</span>
          </div>
        </div>
      </button>
      {menuOpen ? (
        <div className="memberLongPressMenu" role="menu">
          <button
            type="button"
            className="photoMenuAction"
            onClick={() => {
              onPhotoRequest();
              setMenuOpen(false);
            }}
          >
            画像アップロード
          </button>
          <button
            type="button"
            className="archiveMenuAction"
            onClick={() => {
              onArchive();
              setMenuOpen(false);
            }}
          >
            アーカイブ（表示しない）
          </button>
          <button
            type="button"
            className="readingMenuAction"
            onClick={() => {
              onReadingRequest();
              setMenuOpen(false);
            }}
          >
            かな入力
          </button>
          <button type="button" onClick={() => setMenuOpen(false)}>キャンセル</button>
        </div>
      ) : null}
    </div>
  );
}

function MemberModal({ member, isArchived = false, onArchiveToggle, onPhotoUpdate, onReadingUpdate, onClose }) {
  const [expandedEvent, setExpandedEvent] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [readingOpen, setReadingOpen] = useState(false);
  const [eventQuery, setEventQuery] = useState("");
  const eventSummaries = useMemo(() => buildMemberEventSummaries(member.records), [member.records]);
  const filteredEventSummaries = useMemo(() => {
    const needle = normalizeSearchText(eventQuery);
    if (!needle) return eventSummaries;
    return eventSummaries.filter(({ eventName, best, records }) =>
      normalizeSearchText([eventName, best?.meet, best?.date, best?.time, ...records.map((record) => record.meet)].filter(Boolean).join(" ")).includes(needle)
    );
  }, [eventQuery, eventSummaries]);

  useEffect(() => {
    setExpandedEvent("");
    setEventQuery("");
  }, [member]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
        <section className="memberModal" role="dialog" aria-modal="true" aria-label={`${member.name}の記録`} onMouseDown={(event) => event.stopPropagation()}>
          <header className="modalHeader memberDetailHeader">
            <div className="memberTitleBlock">
              <div className="memberNameLine">
                <h2>{member.name}</h2>
                <span>{member.gender || "性別未取得"} / {member.grade || "学年未取得"} / {member.swimClass || "級未取得"}</span>
              </div>
            </div>
            <div className="modalActions">
              <button className="archiveButton readingButton" onClick={() => setReadingOpen(true)}>
                <span>よみ</span>
              </button>
              <button className="archiveButton photoButton" onClick={() => setUploadOpen(true)}>
                <ImagePlus size={16} />
                <span>写真</span>
              </button>
              <button className="iconButton closeButton" onClick={onClose} aria-label="閉じる">×</button>
            </div>
          </header>

          <label className="memberEventSearch">
            <Search size={15} />
            <input value={eventQuery} onChange={(event) => setEventQuery(event.target.value)} placeholder="種目・大会で検索" />
          </label>

          <section className="eventBestList" aria-label="種目別ベスト">
            {filteredEventSummaries.map(({ eventName, best, records }) => {
              const expanded = expandedEvent === eventName;
              return (
                <article className={`eventBestCard ${expanded ? "expanded" : ""}`} key={eventName}>
                  <button onClick={() => setExpandedEvent(expanded ? "" : eventName)}>
                    <div className="eventBestMain">
                      <span>{eventName}</span>
                      <strong>{formatTime(best?.time)}</strong>
                    </div>
                    <span className="bestBadge">BEST</span>
                    <div className="eventBestMeta">
                      <time>{formatDateWithWeekday(best?.date)}</time>
                      <span>{formatRank(best?.rank) || "-"}</span>
                      <span>{best?.meet || "-"}</span>
                    </div>
                    <span className="historyHint">{expanded ? "閉じる" : "履歴を見る"} <b>{expanded ? "⌃" : "⌄"}</b></span>
                  </button>
                  {expanded ? (
                    <div className="recordTable compactRecordTable" aria-label={`${eventName}の履歴`}>
                      <div className="recordTableHeader">
                        <span>日付</span>
                        <span>大会名</span>
                        <span>記録</span>
                        <span>順位</span>
                      </div>
                      {records.map((record) => (
                        <article className="recordTableRow" key={record.id}>
                          <time>{formatDateWithWeekday(record.date)}</time>
                          <strong>{record.meet}</strong>
                          <span className="recordTime">{formatTime(record.time)}</span>
                          <span className="recordRank">{formatRank(record.rank) || "-"}</span>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        </section>
      </div>
      {readingOpen ? (
        <ReadingEditModal
          member={member}
          onReadingUpdate={onReadingUpdate}
          onClose={() => setReadingOpen(false)}
        />
      ) : null}
      {uploadOpen ? (
        <PhotoUploadModal
          memberName={member.name}
          currentPhotoUrl={member.photoUrl}
          onSaved={(photoUrl) => {
            onPhotoUpdate(member.name, photoUrl);
            setUploadOpen(false);
          }}
          onDelete={() => {
            onPhotoUpdate(member.name, "");
            setUploadOpen(false);
          }}
          onClose={() => setUploadOpen(false)}
        />
      ) : null}
    </>
  );
}

function ReadingEditModal({ member, onReadingUpdate, onClose }) {
  const [readingInput, setReadingInput] = useState(member.reading || "");

  useEffect(() => {
    setReadingInput(member.reading || "");
  }, [member]);

  return (
    <div className="modalBackdrop topModal" role="presentation" onMouseDown={onClose}>
      <section className="readingModal" role="dialog" aria-modal="true" aria-label="検索用よみ" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modalHeader compactModalHeader">
          <div>
            <p className="eyebrow">検索用よみ</p>
            <h2>{member.name}</h2>
          </div>
          <button className="iconButton closeButton" onClick={onClose} aria-label="閉じる">×</button>
        </header>
        <label className="readingEditBox">
          <span>ひらがな</span>
          <input
            autoFocus
            value={readingInput}
            onChange={(event) => {
              setReadingInput(event.target.value);
              onReadingUpdate(member.name, event.target.value);
            }}
            placeholder="例: もりかわ ゆめ"
          />
        </label>
      </section>
    </div>
  );
}

function TimesView({ records, memberPhotos, memberReadings, archivedMembers, onArchiveToggle, onPhotoUpdate, onReadingUpdate }) {
  const [eventFilter, setEventFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [eventQuery, setEventQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const options = useMemo(() => buildFilterOptions(records), [records]);
  const memberCards = useMemo(() => buildMemberCards(records, memberPhotos, memberReadings), [records, memberPhotos, memberReadings]);
  const eventOptions = useMemo(
    () => options.events.filter((eventName) => genderFilter === "all" || getGender(eventName) === genderFilter),
    [options.events, genderFilter]
  );
  const filtered = records.filter((record) => {
    const needle = normalizeSearchText(eventQuery);
    if (eventFilter !== "all" && record.event !== eventFilter) return false;
    if (gradeFilter !== "all" && record.grade !== gradeFilter) return false;
    if (classFilter !== "all" && getSwimClass(record) !== classFilter) return false;
    if (genderFilter !== "all" && getGender(record.event) !== genderFilter) return false;
    if (needle && !buildRecordSearchText(record, memberReadings).includes(needle)) return false;
    return true;
  });
  const groupedRecords = useMemo(() => groupRecordsByMeet(filtered), [filtered]);

  useEffect(() => {
    if (eventFilter !== "all" && !eventOptions.includes(eventFilter)) {
      setEventFilter("all");
    }
  }, [eventFilter, eventOptions]);

  return (
    <>
      <section className="filterBar eventFilterBar" aria-label="種目絞り込み">
        <div className="filterRow eventCompactFilters">
          <label>
            <span>性別</span>
            <select value={genderFilter} onChange={(event) => setGenderFilter(event.target.value)}>
              <option value="all">すべて</option>
              <option value="男子">男子</option>
              <option value="女子">女子</option>
              <option value="混合">混合</option>
            </select>
          </label>
          <label>
            <span>学年</span>
            <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}>
              <option value="all">すべて</option>
              {options.grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </label>
          <label>
            <span>級</span>
            <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
              <option value="all">すべて</option>
              {options.classes.map((swimClass) => <option key={swimClass} value={swimClass}>{swimClass}</option>)}
            </select>
          </label>
        </div>
        <label className="eventSelect">
          <span>種目</span>
          <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}>
            <option value="all">すべて</option>
            {eventOptions.map((eventName) => <option key={eventName} value={eventName}>{eventName}</option>)}
          </select>
        </label>
        <label className="eventSearch">
          <span>検索</span>
          <input
            value={eventQuery}
            onChange={(event) => setEventQuery(event.target.value)}
            placeholder="名前・種目・大会名"
          />
        </label>
      </section>

      <section className="timeMeetSections" aria-label="種目一覧">
        {groupedRecords.map((group) => (
          <section className="timeMeetSection" key={group.key}>
            <header>
              <h2>{group.meet}</h2>
              <time>{formatDateWithWeekday(group.date)}</time>
            </header>
            <div className="timeGrid compactTimeGrid">
              {group.records.map((record) => (
                <button className={`timeCard ${eventColorClassName(record.event)}`} key={record.id} onClick={() => setSelectedMember(memberCards.find((member) => member.name === record.swimmer) || null)}>
                  <p>{record.event}</p>
                  <div className="timeCardNameLine">
                    <div className="timeCardNameBlock">
                      {getDisplayReading(record.swimmer, memberReadings[record.swimmer]) ? (
                        <span className="timeCardReading">{getDisplayReading(record.swimmer, memberReadings[record.swimmer])}</span>
                      ) : null}
                      <h2>{record.swimmer}</h2>
                    </div>
                    <span>{record.grade || "-"}</span>
                  </div>
                  <strong>{formatTime(record.time)}</strong>
                </button>
              ))}
            </div>
          </section>
        ))}
      </section>
      {filtered.length === 0 ? <EmptyState title="該当する種目がありません" text="絞り込み条件を変更してください。" /> : null}
      {selectedMember ? (
        <MemberModal
          member={selectedMember}
          isArchived={archivedMembers.includes(selectedMember.name)}
          onArchiveToggle={onArchiveToggle}
          onPhotoUpdate={onPhotoUpdate}
          onReadingUpdate={onReadingUpdate}
          onClose={() => setSelectedMember(null)}
        />
      ) : null}
    </>
  );
}

function MeetsView({ records, upcomingMeets = [], query = "" }) {
  const [mode, setMode] = useState("upcoming");
  const [selectedMeet, setSelectedMeet] = useState(null);
  const [liveUpcomingMeets, setLiveUpcomingMeets] = useState([]);
  const pastMeets = useMemo(() => buildMeetCards(records), [records]);
  const futureSource = upcomingMeets.length ? upcomingMeets : liveUpcomingMeets;
  const futureMeets = useMemo(() => buildUpcomingMeetCards(futureSource, query), [futureSource, query]);
  const meets = mode === "upcoming" ? futureMeets : pastMeets;

  useEffect(() => {
    if (upcomingMeets.length || liveUpcomingMeets.length) return;
    let cancelled = false;
    fetch("/api/tdsystem-records?months=1&futureMonths=3&limitMeets=160", { headers: { Accept: "application/json" } })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!cancelled && Array.isArray(payload?.upcomingMeets)) {
          setLiveUpcomingMeets(payload.upcomingMeets);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [upcomingMeets.length, liveUpcomingMeets.length]);

  return (
    <>
      <div className="meetModeTabs" role="tablist" aria-label="大会の表示切り替え">
        <button className={mode === "upcoming" ? "active" : ""} onClick={() => setMode("upcoming")}>
          開催前
        </button>
        <button className={mode === "past" ? "active" : ""} onClick={() => setMode("past")}>
          開催後
        </button>
      </div>
      <section className="meetList" aria-label="大会一覧">
        {meets.map((meet) => (
          <button className="meetCard" key={meet.key} onClick={() => setSelectedMeet(meet)}>
            <div>
              <time>{formatMeetDateRange(meet)}</time>
              <h2>{meet.name}</h2>
              <p>{meet.place}</p>
            </div>
            <span>{meet.status === "upcoming" ? "予定" : `${meet.records.length}件`}</span>
          </button>
        ))}
      </section>
      {meets.length === 0 ? (
        <EmptyState
          title={mode === "upcoming" ? "開催前の大会はありません" : "開催後の大会はありません"}
          text={mode === "upcoming" ? "更新すると、取得できる予定大会がここに表示されます。" : "記録が取得されるとここに表示されます。"}
        />
      ) : null}
      {selectedMeet ? <MeetModal meet={selectedMeet} onClose={() => setSelectedMeet(null)} /> : null}
    </>
  );
}

function MeetModal({ meet, onClose }) {
  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="settingsModal meetModal" role="dialog" aria-modal="true" aria-label={`${meet.name}の記録`} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modalHeader meetModalHeader">
          <div>
            <p className="eyebrow">大会一覧</p>
            <h2>{meet.name}</h2>
            <span>{formatMeetDateRange(meet)} / {meet.place}</span>
          </div>
          <button className="iconButton closeButton" onClick={onClose} aria-label="閉じる">×</button>
        </header>
        {meet.status === "upcoming" ? (
          <div className="emptyState meetEmptyState">
            <strong>開催前の大会です</strong>
            <span>結果が公開されたら、更新後に記録一覧へ反映されます。</span>
          </div>
        ) : (
          <section className="recordHistory meetRecords">
            {meet.records.map((record) => (
              <article className="meetRecordRow" key={record.id}>
                <div className="meetRecordName">
                  <strong>{record.swimmer}</strong>
                  <span>{record.grade || "-"}</span>
                </div>
                <div className="meetRecordEvent">
                  <span>{record.event}</span>
                </div>
                <div className="meetRecordTime">
                  <strong>{formatTime(record.time)}</strong>
                  <span>{formatRank(record.rank) || "-"}</span>
                </div>
              </article>
            ))}
          </section>
        )}
      </section>
    </div>
  );
}

function SettingsModal({ records, archivedMembers, memberPhotos, memberReadings, onArchiveToggle, onPhotoUpdate, onReadingUpdate, onClose }) {
  const [selectedMember, setSelectedMember] = useState(null);
  const allMembers = useMemo(() => buildMemberCards(records, memberPhotos, memberReadings), [records, memberPhotos, memberReadings]);
  const archivedMemberCards = allMembers.filter((member) => archivedMembers.includes(member.name));

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
        <section className="settingsModal" role="dialog" aria-modal="true" aria-label="設定" onMouseDown={(event) => event.stopPropagation()}>
          <header className="modalHeader">
            <div>
              <p className="eyebrow">設定</p>
              <h2>アーカイブ選手</h2>
              <span>退会・休会などで普段表示しない選手をここで管理します。</span>
            </div>
            <button className="iconButton closeButton" onClick={onClose} aria-label="閉じる">×</button>
          </header>
          <section className="archiveList">
            {archivedMemberCards.length ? (
              archivedMemberCards.map((member) => (
                <article className="archiveRow" key={member.name}>
                  <button onClick={() => setSelectedMember(member)}>
                    <strong>{member.name}</strong>
                    <span>{member.gender || "性別未取得"} / {member.grade || "学年未取得"} / {member.swimClass || "級未取得"}</span>
                  </button>
                  <button className="restoreButton" onClick={() => onArchiveToggle(member.name)}>戻す</button>
                </article>
              ))
            ) : (
              <EmptyState title="アーカイブ選手はいません" text="選手カードの詳細からアーカイブできます。" />
            )}
          </section>
        </section>
      </div>
      {selectedMember ? (
        <MemberModal
          member={selectedMember}
          isArchived
          onArchiveToggle={onArchiveToggle}
          onPhotoUpdate={onPhotoUpdate}
          onReadingUpdate={onReadingUpdate}
          onClose={() => setSelectedMember(null)}
        />
      ) : null}
    </>
  );
}

function PhotoUploadModal({ memberName, currentPhotoUrl = "", onSaved, onDelete, onClose }) {
  const albumInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const stageRef = useRef(null);
  const frameRef = useRef(null);
  const activePointers = useRef(new Map());
  const pinchStart = useRef(null);
  const panStart = useRef(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageMeta, setImageMeta] = useState(null);
  const [crop, setCrop] = useState(() => initialCardCrop());
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const frameAspect = imageMeta ? imageMeta.width / imageMeta.height : 1;
  const fittedCrop = fitCropToFrame(crop, frameAspect);

  async function handleFile(file) {
    if (!file) return;
    const nextUrl = URL.createObjectURL(file);
    const image = await loadImage(nextUrl);
    const nextMeta = { width: image.naturalWidth, height: image.naturalHeight };
    setImageUrl(nextUrl);
    setImageMeta(nextMeta);
    setCrop(initialCardCrop(nextMeta.width / nextMeta.height));
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
    setMessage("");
  }

  function handleStagePointerDown(event) {
    if (!imageUrl) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.current.size === 2) {
      const [first, second] = Array.from(activePointers.current.values());
      pinchStart.current = {
        distance: getPointerDistance(first, second),
        zoom: imageZoom
      };
      panStart.current = null;
      setDragging(null);
      return;
    }
    panStart.current = {
      startX: event.clientX,
      startY: event.clientY,
      pan: imagePan,
      rect: frameRef.current?.getBoundingClientRect()
    };
  }

  function handlePointerDown(event, mode = "move") {
    if (!imageUrl) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = frameRef.current.getBoundingClientRect();
    setDragging({
      mode,
      startX: event.clientX,
      startY: event.clientY,
      crop: fittedCrop,
      rect
    });
  }

  function handlePointerMove(event) {
    if (activePointers.current.has(event.pointerId)) {
      activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pinchStart.current && activePointers.current.size >= 2) {
      const [first, second] = Array.from(activePointers.current.values());
      const distance = getPointerDistance(first, second);
      const nextZoom = clamp(pinchStart.current.zoom * (distance / pinchStart.current.distance), 1, 4);
      setImageZoom(nextZoom);
      setImagePan((current) => clampImagePan(current, nextZoom));
      return;
    }
    if (panStart.current && activePointers.current.size === 1) {
      const rect = panStart.current.rect;
      if (!rect) return;
      const dx = ((event.clientX - panStart.current.startX) / rect.width) * 100;
      const dy = ((event.clientY - panStart.current.startY) / rect.height) * 100;
      setImagePan(clampImagePan({
        x: panStart.current.pan.x + dx,
        y: panStart.current.pan.y + dy
      }, imageZoom));
      return;
    }
    if (!dragging) return;
    const dx = ((event.clientX - dragging.startX) / dragging.rect.width) * 100;
    const dy = ((event.clientY - dragging.startY) / dragging.rect.height) * 100;

    if (dragging.mode === "resize") {
      const maxWidth = getMaxCropWidth(frameAspect);
      const nextWidth = clamp(dragging.crop.width + Math.max(dx, dy), 28, maxWidth);
      const nextHeight = getCropHeight(nextWidth, frameAspect);
      setCrop({
        ...dragging.crop,
        width: nextWidth,
        height: nextHeight,
        x: clamp(dragging.crop.x, 0, 100 - nextWidth),
        y: clamp(dragging.crop.y, 0, 100 - nextHeight)
      });
      return;
    }

    setCrop({
      ...dragging.crop,
      x: clamp(dragging.crop.x + dx, 0, 100 - dragging.crop.width),
      y: clamp(dragging.crop.y + dy, 0, 100 - dragging.crop.height)
    });
  }

  function handlePointerUp() {
    activePointers.current.clear();
    pinchStart.current = null;
    panStart.current = null;
    setDragging(null);
  }

  async function handleSave() {
    if (!imageUrl) return;
    setSaving(true);
    setMessage("");
    try {
      const blob = await cropImageToCard(imageUrl, fittedCrop, imageZoom, imagePan);
      let photoUrl;
      try {
        photoUrl = await uploadMemberImage(blob, memberName);
      } catch {
        photoUrl = await blobToDataUrl(blob);
        setMessage("Firebase未設定のため、この端末内に保存しました。");
      }
      onSaved(photoUrl);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modalBackdrop topModal" role="presentation" onMouseDown={onClose}>
      <section className="uploadModal" role="dialog" aria-modal="true" aria-label="画像アップロード" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modalHeader">
          <div>
            <p className="eyebrow">画像</p>
            <h2>{memberName}</h2>
            <span>顔が見やすいように正方形でトリミングします。</span>
          </div>
          <button className="iconButton closeButton" onClick={onClose} aria-label="閉じる">×</button>
        </header>
        <div className="uploadActions">
          <button onClick={() => cameraInputRef.current?.click()}>
            <Camera size={18} />
            <span>カメラ</span>
          </button>
          <button onClick={() => albumInputRef.current?.click()}>
            <ImagePlus size={18} />
            <span>アルバム</span>
          </button>
          {currentPhotoUrl ? (
            <button className="deletePhotoButton" onClick={onDelete}>
              <span>削除</span>
            </button>
          ) : null}
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={(event) => handleFile(event.target.files?.[0])} />
          <input ref={albumInputRef} type="file" accept="image/*" onChange={(event) => handleFile(event.target.files?.[0])} />
        </div>
        <div
          className="cropStage"
          ref={stageRef}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {imageUrl ? (
            <div className="cropImageFrame" ref={frameRef} style={getImageFrameStyle(imageMeta, imageZoom, imagePan)}>
              <img src={imageUrl} alt="" />
              <div className="cropShade" />
              <div
                className="cropBox"
                style={{ left: `${fittedCrop.x}%`, top: `${fittedCrop.y}%`, width: `${fittedCrop.width}%`, height: `${fittedCrop.height}%` }}
                onPointerDown={(event) => handlePointerDown(event, "move")}
              >
                <span className="cropHandle" onPointerDown={(event) => {
                  event.stopPropagation();
                  handlePointerDown(event, "resize");
                }} />
              </div>
            </div>
          ) : (
            <span>画像を選択してください</span>
          )}
        </div>
        {message ? <p className="uploadMessage">{message}</p> : null}
        <button className="syncButton savePhotoButton" onClick={handleSave} disabled={!imageUrl || saving}>
          {saving ? "保存中" : "保存"}
        </button>
      </section>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="emptyState">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function buildMemberCards(records, memberPhotos = {}, memberReadings = {}) {
  const byMember = new Map();
  records.forEach((record) => {
    const existing = byMember.get(record.swimmer) || [];
    existing.push(record);
    byMember.set(record.swimmer, existing);
  });

  return Array.from(byMember.entries())
    .map(([name, memberRecords]) => {
      const events = Array.from(new Set(memberRecords.map((record) => record.event))).sort();
      return {
        name,
        records: memberRecords,
        events,
        photoUrl: memberPhotos[name] || "",
        reading: getDisplayReading(name, memberReadings[name]),
        gender: latestGender(memberRecords),
        grade: latestValue(memberRecords, "grade"),
        swimClass: latestSwimClass(memberRecords),
        overallBest: getBestRecord(memberRecords)
      };
    })
    .sort((a, b) => compareGrade(a.grade, b.grade) || a.name.localeCompare(b.name, "ja"));
}

function buildMemberFilterOptions(members) {
  return {
    genders: Array.from(new Set(members.map((member) => member.gender).filter(Boolean))).sort(),
    grades: Array.from(new Set(members.map((member) => member.grade).filter(Boolean))).sort(compareGrade),
    classes: Array.from(new Set(members.map((member) => member.swimClass).filter(Boolean))).sort(compareSwimClass)
  };
}

function sortMembers(members, sortMode) {
  return [...members].sort((a, b) => {
    if (sortMode === "class") {
      return compareSwimClass(a.swimClass, b.swimClass) || compareGrade(a.grade, b.grade) || a.name.localeCompare(b.name, "ja");
    }
    return compareGrade(a.grade, b.grade) || compareSwimClass(a.swimClass, b.swimClass) || a.name.localeCompare(b.name, "ja");
  });
}

function buildMemberEventSummaries(records) {
  const byEvent = new Map();
  records.forEach((record) => {
    const existing = byEvent.get(record.event) || [];
    existing.push(record);
    byEvent.set(record.event, existing);
  });
  return Array.from(byEvent.entries())
    .map(([eventName, eventRecords]) => {
      const sortedRecords = [...eventRecords].sort((a, b) => b.date.localeCompare(a.date));
      return {
        eventName,
        records: sortedRecords,
        best: getBestRecord(sortedRecords)
      };
    })
    .sort((a, b) => a.eventName.localeCompare(b.eventName, "ja"));
}

function buildFilterOptions(records) {
  return {
    events: Array.from(new Set(records.map((record) => record.event).filter(Boolean))).sort(),
    grades: Array.from(new Set(records.map((record) => record.grade).filter(Boolean))).sort(compareGrade),
    classes: Array.from(new Set(records.map(getSwimClass).filter(Boolean))).sort(compareSwimClass)
  };
}

function buildMeetCards(records) {
  const byMeet = new Map();
  records.forEach((record) => {
    const key = `${record.date}-${record.meet}`;
    const existing = byMeet.get(key) || { key, date: record.date, name: record.meet, place: record.place, records: [] };
    existing.records.push(record);
    byMeet.set(key, existing);
  });
  return Array.from(byMeet.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function buildUpcomingMeetCards(meets, query = "") {
  const needle = normalizeSearchText(query);
  return meets
    .map((meet) => ({
      key: meet.id || `${meet.date}-${meet.name}`,
      date: meet.date,
      endDate: meet.endDate || meet.date,
      name: meet.name,
      place: meet.place || "",
      sourceUrl: meet.sourceUrl || "",
      status: "upcoming",
      records: []
    }))
    .filter((meet) => {
      if (!needle) return true;
      return normalizeSearchText([meet.date, meet.name, meet.place].filter(Boolean).join(" ")).includes(needle);
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function groupRecordsByMeet(records) {
  const byMeet = new Map();
  records.forEach((record) => {
    const key = `${record.date}-${record.meet}`;
    const group = byMeet.get(key) || { key, date: record.date, meet: record.meet || "大会名未取得", records: [] };
    group.records.push(record);
    byMeet.set(key, group);
  });
  return Array.from(byMeet.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function latestValue(records, key) {
  return [...records].sort((a, b) => b.date.localeCompare(a.date)).find((record) => record[key])?.[key] || "";
}

function latestGender(records) {
  return [...records].sort((a, b) => b.date.localeCompare(a.date)).map((record) => getGender(record.event)).find(Boolean) || "";
}

function latestSwimClass(records) {
  return [...records].sort((a, b) => b.date.localeCompare(a.date)).map(getSwimClass).find(Boolean) || "";
}

function getBestRecord(records) {
  return records.reduce((best, record) => {
    if (!best) return record;
    return timeToMilliseconds(record.time) < timeToMilliseconds(best.time) ? record : best;
  }, null);
}

function timeToMilliseconds(time) {
  if (!time) return Number.POSITIVE_INFINITY;
  const parts = time.split(":").map(Number);
  if (parts.length === 1) return parts[0] * 1000;
  return parts[0] * 60 * 1000 + parts[1] * 1000;
}

function getGender(eventName) {
  if (eventName?.includes("男子")) return "男子";
  if (eventName?.includes("女子")) return "女子";
  if (eventName?.includes("混合")) return "混合";
  return "";
}

function eventColorClassName(eventName = "") {
  if (eventName.includes("個人メドレー") || eventName.includes("メドレー")) return "eventMedley";
  if (eventName.includes("バタフライ")) return "eventFly";
  if (eventName.includes("背泳ぎ")) return "eventBack";
  if (eventName.includes("平泳ぎ")) return "eventBreast";
  if (eventName.includes("自由形")) {
    if (eventName.includes("400m") || eventName.includes("800m") || eventName.includes("1500m")) return "eventDistanceFree";
    if (eventName.includes("200m")) return "eventMidFree";
    return "eventFree";
  }
  return "eventOther";
}

function genderClassName(gender) {
  if (gender === "男子") return "maleChip";
  if (gender === "女子") return "femaleChip";
  if (gender === "混合") return "mixedChip";
  return "unknownChip";
}

function buildRecordSearchText(record, memberReadings = {}) {
  const values = [record.swimmer, memberReadings[record.swimmer], getNameReading(record.swimmer), record.event, record.meet, record.place, record.note];
  return normalizeSearchText(values.filter(Boolean).join(" "));
}

function getNameReading(name) {
  return NAME_READING_PARTS.reduce((reading, [kanji, kana]) => reading.replaceAll(kanji, kana), String(name || ""));
}

function getDisplayReading(name, savedReading) {
  const reading = normalizeSearchText(savedReading || getNameReading(name));
  const normalizedName = normalizeSearchText(name);
  return reading && reading !== normalizedName ? reading : "";
}

function normalizeSearchText(value) {
  return toHiragana(String(value || ""))
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function toHiragana(value) {
  return value.replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function getSwimClass(record) {
  const direct = record.swimClass || record.class || record.level;
  if (direct) return normalizeSwimClass(direct);
  return normalizeSwimClass([record.grade, record.note, record.event].filter(Boolean).join(" "));
}

function normalizeSwimClass(value) {
  const text = String(value || "").replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  return text.match(/(?:\d{1,2}|[A-ZＳ])級/)?.[0] || "";
}

function compareSwimClass(a, b) {
  return swimClassOrder(a) - swimClassOrder(b) || a.localeCompare(b, "ja");
}

function swimClassOrder(value) {
  const text = String(value || "");
  const number = Number(text.replace(/\D/g, ""));
  if (Number.isFinite(number) && number > 0) return number;
  if (text.includes("S") || text.includes("Ｓ")) return 0;
  return 99;
}

function getLatestDate(records) {
  return records.reduce((latest, record) => (record.date > latest ? record.date : latest), "");
}

function isEventBest(records, targetRecord) {
  const eventRecords = records.filter((record) => record.event === targetRecord.event);
  const best = getBestRecord(eventRecords);
  return best?.id === targetRecord.id || timeToMilliseconds(targetRecord.time) <= timeToMilliseconds(best?.time);
}

function readSeenMemberUpdates() {
  try {
    return JSON.parse(localStorage.getItem("rs-kenneys-seen-member-updates") || "[]");
  } catch {
    return [];
  }
}

function saveSeenMemberUpdates(values) {
  localStorage.setItem("rs-kenneys-seen-member-updates", JSON.stringify(values.slice(-300)));
}

function compareGrade(a, b) {
  return gradeOrder(a) - gradeOrder(b);
}

function gradeOrder(grade) {
  const group = grade?.[0] || "";
  const number = Number(grade?.replace(/\D/g, "") || 0);
  const base = group === "小" ? 0 : group === "中" ? 10 : group === "高" ? 20 : 30;
  return base + number;
}

function formatRank(rank) {
  if (!rank) return "";
  return /^\d+$/.test(rank) ? `${rank}位` : rank;
}

function formatTime(time) {
  if (!time) return "--";
  return `${time}秒`;
}

function formatMeetDateRange(meet) {
  if (!meet?.date) return "-";
  const startDate = formatDateWithWeekday(meet.date);
  if (!meet.endDate || meet.endDate === meet.date) return startDate;
  return `${startDate} - ${formatDateWithWeekday(meet.endDate)}`;
}

function formatDateWithWeekday(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).split("/").map(Number);
  if (!year || !month || !day) return value;
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const date = new Date(year, month - 1, day);
  return `${value}(${weekdays[date.getDay()]})`;
}

function formatRefreshInterval(minutes) {
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440}日ごと`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}時間ごと`;
  return `${minutes}分ごと`;
}

function initialCardCrop(frameAspect = 1) {
  const width = frameAspect >= CARD_CROP_ASPECT ? 78 / frameAspect : 78;
  const height = getCropHeight(width, frameAspect);
  return {
    x: (100 - width) / 2,
    y: (100 - height) / 2,
    width,
    height
  };
}

async function cropImageToCard(imageUrl, crop, imageZoom = 1, imagePan = { x: 0, y: 0 }) {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = Math.round(canvas.width / CARD_CROP_ASPECT);
  const context = canvas.getContext("2d");

  const zoom = Math.max(1, imageZoom || 1);
  const sourceXPercent = clamp(50 + (crop.x - 50 - (imagePan.x || 0)) / zoom, 0, 100);
  const sourceYPercent = clamp(50 + (crop.y - 50 - (imagePan.y || 0)) / zoom, 0, 100);
  const sourceWidthPercent = Math.min(crop.width / zoom, 100 - sourceXPercent);
  const sourceHeightPercent = Math.min(crop.height / zoom, 100 - sourceYPercent);
  const sx = image.naturalWidth * (sourceXPercent / 100);
  const sy = image.naturalHeight * (sourceYPercent / 100);
  const sourceWidth = image.naturalWidth * (sourceWidthPercent / 100);
  const sourceHeight = image.naturalHeight * (sourceHeightPercent / 100);

  context.drawImage(image, sx, sy, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

function getCropHeight(width, frameAspect = 1) {
  return width * frameAspect / CARD_CROP_ASPECT;
}

function getMaxCropWidth(frameAspect = 1) {
  return Math.min(94, 94 / frameAspect);
}

function fitCropToFrame(crop, frameAspect = 1) {
  const width = clamp(crop.width, 28, getMaxCropWidth(frameAspect));
  const height = getCropHeight(width, frameAspect);
  return {
    ...crop,
    width,
    height,
    x: clamp(crop.x, 0, 100 - width),
    y: clamp(crop.y, 0, 100 - height)
  };
}

function getPointerDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y) || 1;
}

function clampImagePan(pan, imageZoom = 1) {
  const maxPan = 50 * (Math.max(1, imageZoom || 1) - 1) / Math.max(1, imageZoom || 1);
  return {
    x: clamp(pan.x || 0, -maxPan, maxPan),
    y: clamp(pan.y || 0, -maxPan, maxPan)
  };
}

function getImageFrameStyle(meta, imageZoom = 1, imagePan = { x: 0, y: 0 }) {
  if (!meta?.width || !meta?.height) return {};
  const zoom = Math.max(1, imageZoom || 1);
  const pan = clampImagePan(imagePan, zoom);
  const imageAspect = meta.width / meta.height;
  if (imageAspect >= 1) {
    const height = 100 / imageAspect;
    return {
      width: "100%",
      height: `${height}%`,
      left: "0%",
      top: `${(100 - height) / 2}%`,
      "--image-zoom": zoom,
      "--image-pan-x": `${pan.x}%`,
      "--image-pan-y": `${pan.y}%`
    };
  }
  const width = imageAspect * 100;
  return {
    width: `${width}%`,
    height: "100%",
    left: `${(100 - width) / 2}%`,
    top: "0%",
    "--image-zoom": zoom,
    "--image-pan-x": `${pan.x}%`,
    "--image-pan-y": `${pan.y}%`
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

createRoot(document.getElementById("root")).render(<App />);
