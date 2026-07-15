# RSケーニーズ 記録ボード

TDSYSTEM の参加チーム記録から、RSケーニーズの記録を確認する PWA 形式の React アプリです。

## 画面

- 直近の戦績
- 最高記録
- 更新履歴

## 実データ連携

このプロジェクト内のローカルサーバーには、TDSYSTEM のページを取得して RSケーニーズの記録だけを JSON に変換する API を入れています。

```text
http://127.0.0.1:4173/api/tdsystem-records?team=RSケーニーズ
```

標準では直近8大会を巡回し、12時間は取得結果をキャッシュします。アプリ画面側の自動更新は1日1回です。

## メンバー画像

Firebase Storage を使う場合は `.env` に次を設定してください。

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_APP_ID=...
```

未設定でも画像トリミングは試せます。その場合は端末内の保存だけになります。

別サーバーへ切り替える場合は、`.env` に次の値を設定してください。

```env
VITE_TDSYSTEM_PROXY_URL=https://example.com/api/tdsystem-records
```

API は次の形式で返します。

```json
{
  "records": [
    {
      "id": "optional-stable-id",
      "team": "RSケーニーズ",
      "date": "2026/07/12",
      "swimmer": "山田 湊",
      "event": "男子 50m 自由形",
      "time": "25.84",
      "meet": "大会名",
      "place": "会場名",
      "note": "自己新"
    }
  ]
}
```

`id` がない場合はアプリ側で安定IDを作ります。新しいIDが見つかったとき、更新履歴へ自動追加されます。
