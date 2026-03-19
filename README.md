# DeadlineChain

国際会議の締切とレビュー進行をもとに、
リジェクト後に次に投稿可能な会議を可視化する静的Webアプリ。

## 概要
- フロントエンドのみ（Next.js / React）
- 完全静的サイト（GitHub Pagesで動作）
- バックエンドなし
- データはCSV管理
- 日付計算はすべてクライアント側（JavaScript）

## データ設計

### `conferences.csv`
列定義:
- `id`
- `name`
- `rank`（A* / A / B / C）
- `area`（security / systems など）
- `location`
- `url`
- `paper_deadline`
- `r1_date`（early reject）
- `r2_date`（notification：判定日）
- `revision_date`（最終判定 or revision締切）
- `camera_ready`（任意・表示のみ）
- `event_start`
- `event_end`

制約:
- 日付はすべてISO形式（`YYYY-MM-DD`）
- `camera_ready`はロジックに使用しない

## イベント定義

Rejectableイベント:
- `R1`（early reject）
- `R2`（notification）
- `Revision`（最終判定）

非対象:
- `camera_ready`（採択後のみ）

## UI仕様

1行に1会議を表示:

```text
[CCS]  A*  2026-05-17
R1:06-03  R2:07-01  Revision:07-17
```

表示項目:
- 会議名
- rank
- paper_deadline
- R1 / R2 / Revision

## 操作仕様

各会議行で以下をクリック可能:
- `paper_deadline`（投稿）
- `R1`
- `R2`
- `Revision`

## 状態管理

```ts
selectedConference
selectedDate
selectedType // submit / R1 / R2 / Revision
```

## フィルタロジック

### 1) 投稿期限クリック（submit）
意味: 「この会議に投稿した」

制約: 次のR1まで他の投稿不可

```ts
next_available_date = r1_date
```

### 2) Rejectイベントクリック（R1 / R2 / Revision）

基準日:

| 選択 | 基準日 |
|------|--------|
| R1 | r1_date |
| R2 | r2_date |
| Revision | revision_date |

修正期間:
- R1: +14日
- R2: +28日
- Revision: +42日

投稿可能条件:

```ts
conference.paper_deadline >= 基準日 + 修正期間
```

条件を満たさない会議は非表示。

## 表示ルール
- 投稿可能な会議のみ表示
- 最短投稿可能な会議を強調表示（例: 緑）

## ランク処理

順位:

```text
C < B < A < A*
```

フィルタ:
- A*のみ
- A以上
- 全体

## 設計方針
- Chainデータは持たない
- 締切と時間制約のみで遷移を計算
- UI操作を状態遷移として扱う

## 非機能要件
- GitHub Pagesで動作
- 軽量（外部APIなし）
- レスポンシブ対応
- 即時再描画

## 今後の拡張
- 分野フィルタ
- CFP自動取得
- Minor / Major revision分離
- 投稿戦略のスコアリング
- ユーザー進捗入力
