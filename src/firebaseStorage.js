import { initializeApp } from "firebase/app";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let app;
let storage;
let db;

function isConfigured() {
  return Object.values(firebaseConfig).every(Boolean);
}

export async function uploadMemberImage(blob, memberName) {
  if (!isConfigured()) {
    throw new Error("Firebase is not configured.");
  }

  ensureFirebase();

  const safeName = encodeURIComponent(memberName).replace(/%/g, "");
  const imageRef = ref(storage, `member-images/${safeName}-${Date.now()}.jpg`);
  await uploadBytes(imageRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(imageRef);
}

export async function loadBoardState() {
  if (!isConfigured()) {
    throw new Error("Firebase is not configured.");
  }

  ensureFirebase();
  const snapshot = await getDoc(doc(db, "boards", "rs-kenneys-records"));
  if (!snapshot.exists()) return null;

  const boardState = snapshot.data();
  const chunks = [];
  for (let index = 0; index < (boardState.recordChunkCount || 0); index += 1) {
    const chunkSnapshot = await getDoc(doc(db, "boards", "rs-kenneys-records", "recordChunks", `chunk-${index}`));
    if (chunkSnapshot.exists()) {
      chunks.push(...(chunkSnapshot.data().records || []));
    }
  }

  return { ...boardState, recentResults: chunks };
}

export async function saveBoardState(state) {
  if (!isConfigured()) {
    throw new Error("Firebase is not configured.");
  }

  ensureFirebase();
  const records = state.recentResults || [];
  const chunkSize = 300;
  const recordChunkCount = Math.ceil(records.length / chunkSize);
  const { recentResults, ...boardState } = state;

  await setDoc(doc(db, "boards", "rs-kenneys-records"), {
    ...boardState,
    recordChunkCount,
    cloudUpdatedAt: new Date().toISOString()
  }, { merge: true });

  for (let index = 0; index < recordChunkCount; index += 1) {
    await setDoc(doc(db, "boards", "rs-kenneys-records", "recordChunks", `chunk-${index}`), {
      records: records.slice(index * chunkSize, (index + 1) * chunkSize)
    });
  }
}

function ensureFirebase() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    storage = getStorage(app);
    db = getFirestore(app);
  }
}
