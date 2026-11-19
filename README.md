# XML_PI — 添付文書 比較ビューア（試作）

PMDA が公開している医療用医薬品の XML 添付文書を使い、最大 5 品目を横に並べて、
項目（禁忌、用法及び用量、相互作用、副作用 …）ごとに行を揃えて比較表示するアプリの試作です。

> **開発中は個人利用に限ります。** 公開する場合は、事前に PMDA の許諾を得てください。

中継サーバーをどこで動かすかによって、2 つの版があります。

| フォルダ | 版 | 中継サーバー | 説明 |
|---|---|---|---|
| [`codespaces/`](codespaces/) | Codespaces 版 | GitHub Codespaces（または自分のパソコン） | これまでの版。使い方・しくみの詳しい説明もここにあります |
| [`render/`](render/) | Render 版 | Render の Web サービス | URL を開くだけで使える版。Basic 認証つき |

- Codespaces で開くと、`.devcontainer/` の設定により `codespaces/server.py` が自動で起動します。
- Render には、ルートの `render.yaml`（Blueprint）で `render/` フォルダだけをデプロイします。
