# DeadlineChain

国際会議の締切とレビュー進行をもとに、
リジェクト後に次に投稿可能な会議を可視化する静的Webアプリ。

## 概要
- フロントエンドのみ（Next.js / React）
- 完全静的サイト（GitHub Pagesで動作）
- バックエンドなし
- データはJSON管理
- 日付計算はすべてクライアント側（JavaScript）

## 運用
### 0. クローン
```bash
git clone https://github.com/Tyojan/DeadlineChain.git
cd DeadlineChain
```
### Windows でローカル確認する

Windows では、まず [Node.js の LTS 版](https://nodejs.org/en/download) をインストールする。npm は Node.js に同梱されているため、別途インストールする必要はない。

インストール後に PowerShell を再起動し、以下で確認する。

```powershell
node --version
npm --version
```

次のコマンドで、本番に配置するものと同じ静的成果物を生成し、ローカルで配信する。

```powershell
npm.cmd ci
npm.cmd run build
npx.cmd --yes serve out -l 3000
```

ブラウザで `http://localhost:3000/index.html` を開く。配信を終了するには、PowerShell で `Ctrl + C` を押す。

> PowerShell の実行ポリシーによって `npm` が実行できない環境でも、上記の `npm.cmd` / `npx.cmd` は使える。

データを更新する場合は `public/conference.json` を編集し、`out/` は直接編集しない。更新後はローカルサーバーを停止してから、再度 `npm.cmd run build` と `npx.cmd --yes serve out -l 3000` を実行して確認する。


### 1. 公開用ファイルを生成する
```bash
npm ci
npm run build
```

- `npm ci`  
  依存ライブラリをインストール
- `npm run build`  
  本番用の静的ファイルを生成

生成物は `out/` に出力

### 2. 生成物を公開ディレクトリへ配置する
```bash
sudo mkdir -p /var/www/deadlinechain
sudo cp -r out/* /var/www/deadlinechain
```

- `/var/www/deadlinechain`  
  本番公開用ファイルの配置先
- `cp -r out/* /var/www/deadlinechain/`  
  ビルドで生成した静的ファイルを公開用ディレクトリへコピーする

### 3. Nginx を設定する
`/etc/nginx/sites-available/deadlinechain` を作成し、以下を記載

```nginx
server {
    listen ポート番号;
    listen [::]:ポート番号;
    server_name _;

    root /var/www/deadlinechain;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- `listen ポート番号`  
  ポート番号で公開する
- `root /var/www/deadlinechain`  
  配信するファイルの配置先を指定する

### 4. Nginx 設定を有効化する
```bash
sudo ln -s /etc/nginx/sites-available/deadlinechain /etc/nginx/sites-enabled/deadlinechain
sudo systemctl restart nginx
```

- `ln -s ...`  
  作成した設定を有効化する
- `systemctl restart nginx`  
  設定を反映する

### 5. 動作確認
```text
http://<サーバーIP>:ポート番号
```

## データ設計

### `public/conference.json`

会議データは JSON の `conferences` 配列で管理する。

```json
{
  "conferences": [
    {
      "id": "example2027",
      "name": "Example Conference 2027",
      "rank": "A",
      "location": "Tokyo, Japan",
      "url": "https://example.org",
      "deadlines": {
        "abstract": "2026-05-01",
        "paper": "2026-05-08",
        "early_reject": "2026-06-01",
        "notification": "2026-07-01",
        "revision_date": "2026-07-15",
        "camera_ready": "2026-08-01"
      },
      "event": {
        "start": "2026-10-01",
        "end": "2026-10-03"
      },
      "classification": {
        "topics": ["security", "cryptography"],
        "venue_type": "conference",
        "orientation": "academic"
      }
    }
  ]
}
```

主な項目:

- `id`: 一意な識別子
- `name`: 会議名
- `rank`: `A*` / `A` / `B` / `C`
- `location`: 開催地
- `url`: 公式サイトまたは CFP の URL
- `deadlines.abstract`: アブストラクト締切
- `deadlines.paper`: 投稿締切
- `deadlines.early_reject`: Early Reject 通知日
- `deadlines.notification`: 最終通知日
- `deadlines.revision_date`: Revision 締切または最終判定日
- `deadlines.camera_ready`: Camera-ready 締切
- `event.start` / `event.end`: 開催開始日・終了日

制約:
- 日付はすべてISO形式（`YYYY-MM-DD`）
- `camera_ready`はロジックに使用しない

### 会議分類（`classification`）

各会議には、分野・開催形式・性格を表す `classification` を付与する。

#### `topics`

研究分野。複数指定できる。

- `security`: 情報セキュリティ全般
- `cryptography`: 暗号理論・暗号技術
- `systems`: OS、分散システム、実装・運用
- `ai`: AI・機械学習

#### `venue_type`

発表媒体。原則として1つ指定する。

- `conference`: 査読付きの国際会議・シンポジウム
- `workshop`: 査読付きまたは選考のあるワークショップ
- `journal`: 論文誌・ジャーナル
- `domestic`: 国内の学術シンポジウム・研究会

#### `orientation`

会議の主な性格。原則として1つ指定する。

- `academic`: 学術研究を中心とする会議
- `industry`: 産業・実務を中心とする会議

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

## 今後の拡張
- 分野フィルタ
- CFP自動取得
