# Copilot Instructions for DeadlineChain

## 前提条件

- **回答は必ず日本語でしてください。**
- コードコメントも日本語で記述してください。
- エラーメッセージや技術的な説明も日本語で行ってください。
- 大規模な変更（100行以上）を行う前には、まず変更計画を日本語で提案してください。

## プロジェクトについて
このリポジトリでは、国際会議の締切とレビュー進行にもとづいて、
「リジェクト後に次に投稿可能な会議」を可視化する静的Webアプリを構築する。

## プロジェクト前提
- 技術: Next.js / React（フロントエンドのみ）
- 配布: GitHub Pages（完全静的サイト）
- バックエンド: なし
- データ源: `conferences.csv`
- 日付計算: すべてクライアント側 JavaScript で実行

## データ仕様
- CSVの列は以下を前提に実装すること:
  - `id`, `name`, `rank`, `area`, `location`, `url`
  - `paper_deadline`, `r1_date`, `r2_date`, `revision_date`
  - `camera_ready`（任意・表示のみ）
  - `event_start`, `event_end`
- 日付は ISO 形式 `YYYY-MM-DD` とする。
- `camera_ready` はロジック計算に使用しない。

## イベント定義
- Rejectable イベント: `R1`, `R2`, `Revision`
- 投稿イベント: `submit`（`paper_deadline` クリック）
- `camera_ready` は遷移対象外。

## 状態管理
最低限、以下の状態を持つこと:
- `selectedConference`
- `selectedDate`
- `selectedType`（`submit` / `R1` / `R2` / `Revision`）

## フィルタロジック
### 1) 投稿期限クリック（submit）
- 意味: 「この会議に投稿した」
- 制約: 次の `r1_date` まで他会議へ投稿不可
- 利用可能日: `next_available_date = r1_date`

### 2) Reject イベントクリック（R1/R2/Revision）
- 基準日:
  - `R1` -> `r1_date`
  - `R2` -> `r2_date`
  - `Revision` -> `revision_date`
- 修正期間:
  - `R1`: +14日
  - `R2`: +28日
  - `Revision`: +42日
- 投稿可能条件:
  - `conference.paper_deadline >= 基準日 + 修正期間`
- 条件を満たさない会議は非表示。

## UI要件
- 1行1会議で以下を表示:
  - 会議名
  - rank
  - paper_deadline
  - `R1` / `R2` / `Revision`
- クリック可能要素:
  - `paper_deadline`（投稿）
  - `R1`
  - `R2`
  - `Revision`
- 投稿可能会議のみ表示する。
- 最短投稿可能な会議を強調表示する（例: 緑）。

## ランクフィルタ
順位: `C < B < A < A*`

実装するフィルタ:
- `A*のみ`
- `A以上`
- `全体`

## 実装方針
- Chain データは保持しない。
- 締切と時間制約だけで遷移を計算する。
- UI操作を状態遷移として扱う。

## 非機能要件
- GitHub Pages で動作可能な静的出力
- 軽量（外部APIなし）
- レスポンシブ対応
- 即時再描画

## 変更時の注意
- 要件にない機能は追加しない。
- 日付計算ロジックはユーティリティ関数として分離する。
- UI文言は可能な限り簡潔に保つ。
- 型定義（TypeScript）とデータバリデーションを優先する。

## 将来拡張（今回は実装対象外）
- 分野フィルタ
- CFP自動取得
- Minor / Major revision 分離
- 投稿戦略スコアリング
- ユーザー進捗入力
