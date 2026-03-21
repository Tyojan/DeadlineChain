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

