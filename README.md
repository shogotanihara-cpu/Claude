# app.oshihitsuji.jp

ブラウザだけで動く小さなアプリを置いているリポジトリです。
どれも静的ファイルだけの PWA で、記録は端末のブラウザの中にのみ保存されます。

| アプリ | 場所 | 公開 URL | 何をするもの |
|---|---|---|---|
| **ログ** | [`log/`](log/README.md) | https://app.oshihitsuji.jp/log/ | 睡眠・服薬・体調をタイムラインで記録し、受診用の1枚にまとめる |
| **ワケワケ** | [`wake/`](wake/README.md) | https://app.oshihitsuji.jp/wake/ | 大きなタスクを分解して、次に手をつけるものを1枚目に出す |

コードも保存データ（localStorage のキー）も、アプリごとに完全に分かれています。
それぞれのくわしい説明は、各フォルダの README にあります。

## 並び

**1つのフォルダが、1つのアプリで、1つの公開先。**
リポジトリの並びが、そのまま公開されるサイトの並びになります。

```
log/            記録アプリ「ログ」    → /log/
wake/           タスク管理「ワケワケ」→ /wake/
robots.txt      サイト全体のクローラー向け設定
CNAME           カスタムドメインの指定
handoffs/       作業の引き継ぎメモ（公開されません）
```

**ドメイン直下（`/`）には何も置きません。** アプリは必ずフォルダの中に入り、
横に並びます。直下は 404 のままです。

## アプリを増やすには

フォルダを作って、その中に `index.html` を置くだけです。

```
mkdir 新しいアプリ名/
```

公開の手順は「`index.html` を持つフォルダを、そのまま `_site/` に並べる」と
書いてあるだけなので、**ワークフローを編集する必要はありません。**
`handoffs/` のように `index.html` を持たないフォルダは、公開されません。

新しいアプリを作るときは、既存の2つにならって次を用意すると形がそろいます。

- `index.html` / `css/` / `js/` — 本体。参照はすべて相対パスにする
- `manifest.webmanifest` — `"id"` にそのアプリの公開パス（例 `"/wake/"`）を明示する。
  こうしておくと、あとで置き場所を変えても、インストール済みのアプリと
  同じものだと認識される
- `sw.js` — Service Worker。フォルダの中に置けばスコープがその中に閉じるので、
  隣のアプリのリクエストに口を出すことはない
- `icons/` — ホーム画面に並んだとき、隣のアプリと見分けのつくもの
- `README.md` — そのアプリの説明（公開はされません）

## 公開

`main` ブランチに変更が入ると GitHub Actions（`.github/workflows/pages.yml`）が
自動で GitHub Pages にデプロイします。

同じドメインで運用しているブログとは別のサブドメインに置いています。
ブログの apex（`oshihitsuji.jp`）のレコードには一切触れていません。

### 初回だけ必要な設定

1. **DNS** — `app` の CNAME レコードを `shogotanihara-cpu.github.io.` に向ける
2. **GitHub** — Settings → Pages → Build and deployment → Source を **「GitHub Actions」** に変更
3. DNS の確認が通ったら、同じ画面で **Enforce HTTPS** を有効にする

（`configure-pages` の `enablement` による Pages の自動有効化は、GITHUB_TOKEN に
Pages サイトの作成権限がないため使えません。手順 2 は手動で行う必要があります。）

## ローカルで動かす

```bash
python3 -m http.server 8000
# ログ     → http://localhost:8000/log/
# ワケワケ → http://localhost:8000/wake/
```

> Service Worker は `https://` または `localhost` でのみ動きます。
> `file://` で直接開いた場合、アプリ自体は動きますがオフラインキャッシュは無効です。
