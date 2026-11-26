# XML_PI — 添付文書 比較ビューア（Render 版）

Codespaces 版（`../codespaces/`）と同じアプリを、[Render](https://render.com/) の Web サービスとして動かす版です。
画面（`public/`）は Codespaces 版と同じもので、違いは中継サーバー `server.py` の起動設定と認証だけです。
使い方・しくみ・項目マスタ・制限事項は [Codespaces 版の README](../codespaces/README.md) を参照してください。

> **開発中は個人利用に限ります。** Render の URL はインターネットに公開されるため、
> この版は合言葉（Basic 認証）を設定しないと起動しません。URL と合言葉を他の人に教えないでください。
> 一般に公開する場合は、事前に PMDA の許諾を得てください。

## Codespaces 版との違い

| | Codespaces 版 | Render 版 |
|---|---|---|
| アクセスできる人 | 自分の GitHub アカウントだけ（転送ポートが非公開） | URL と合言葉を知っている人 |
| 待ち受け | 127.0.0.1:8000 | 0.0.0.0、ポートは Render が渡す `PORT` |
| 認証 | なし | Basic 認証（`APP_USER` / `APP_PASSWORD`、未設定なら起動しない） |
| ヘルスチェック | なし | `/healthz`（認証なしで `ok` を返す） |
| 検索エンジン | — | `X-Robots-Tag: noindex` を付ける |
| 内部エラー | 詳細を画面に表示 | 画面には出さず、Render のログにだけ出す |
| 起動の手間 | Codespace を開く | URL を開くだけ（無料プランは初回アクセスに時間がかかることあり） |

## Render へのデプロイ

リポジトリのルートにある `render.yaml`（Blueprint）を使います。

1. Render にログインし、**New → Blueprint** を選びます。
2. GitHub の `DeepPharmacist/XML_PI` を接続して選びます。
3. `APP_USER` と `APP_PASSWORD` の入力欄が出るので、ログイン名と合言葉を入力します。
   合言葉は長めのランダムな文字列にしてください。
4. **Apply** を押すと `xml-pi` という Web サービスが作られ、`https://xml-pi-xxxx.onrender.com` のような URL が発行されます。
5. URL を開くとログイン画面が出るので、3 で決めた名前と合言葉を入力します。

`main` ブランチの `render/` 以下を変更して push すると、自動で再デプロイされます（`codespaces/` だけの変更では再デプロイしません）。

Blueprint を使わず手動で作る場合は、New → Web Service で次のように設定します。

| 項目 | 値 |
|---|---|
| Root Directory | `render` |
| Runtime | Python 3 |
| Build Command | `echo ok`（依存ライブラリなし） |
| Start Command | `python server.py` |
| Health Check Path | `/healthz` |
| 環境変数 | `APP_USER`、`APP_PASSWORD`（必須）、`PYTHON_VERSION=3.12.7` |

## ユーザーテスト用のアカウント

メインのログイン名・合言葉（`APP_USER` / `APP_PASSWORD`）を教えずに、ほかの人にも使ってもらうための仕組みです。
Render の **xml-pi → Environment** に、環境変数 `APP_TEST_USERS` を 1 つ追加します。

```
APP_TEST_USERS = tester1:合言葉1:2026-12-31,tester2:合言葉2:2026-12-31
```

- 1 人分は「名前:合言葉:有効期限」で、人数分をカンマ `,` でつなげます。
- 有効期限（`YYYY-MM-DD`）は、その日の日本時間 23:59 まで使えます。省略すると期限なしになります。
- 合言葉は 12 文字以上にしてください。`:` と `,` は使えません。
  条件に合わない行は無視され、Render のログに理由が出ます。
- 保存すると再デプロイされ、1〜2 分で使えるようになります。

**1 人だけ削除する**：`APP_TEST_USERS` からその人の分を消して保存します。ほかの人とメインのアカウントには影響しません。
**テストを終える**：`APP_TEST_USERS` ごと削除します。期限を入れておけば、消し忘れても期限の翌日から入れなくなります。

Render の Logs には、各アクセスがどのアカウントのものか `[tester1]` のように記録されます。

注意：Basic 認証はブラウザが合言葉を覚えるため、「ログアウト」はありません。共用パソコンでテストしてもらう場合は、終わったらブラウザを閉じてもらってください。

## 無料プランでの注意

- 15 分ほどアクセスがないとスリープし、次のアクセスで起動するまで 1 分程度かかります。
- スリープや再デプロイでメモリ上のキャッシュ（XML 30 分・検索 10 分）は消えます。ファイルには何も保存しません。
- PMDA へのリクエストは Codespaces 版と同じく 1 本ずつ・最低 1 秒間隔です（`PMDA_MIN_INTERVAL`）。

## 手元で試す

```bash
cd render
APP_USER=me APP_PASSWORD=test PORT=8000 python server.py
```

ブラウザで <http://localhost:8000/> を開き、`me` / `test` でログインします。

## 画面を修正するとき

`public/` は Codespaces 版と同じ内容のコピーです。画面を直したときは、両方のフォルダに同じ変更を入れてください。
