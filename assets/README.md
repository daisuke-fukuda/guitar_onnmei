# ブランドアセットの出所

シェアボタンで使う各サービスのロゴは、**各社の公式配布元から直接取得**している。
画像検索・アイコンライブラリ・ストックサイトから取得してはいけない（Meta は明示的に禁止しており、他社も同様の方針）。

| ファイル | サービス | 取得元 | 取得日 |
| --- | --- | --- | --- |
| `x-logo.svg` | X | https://about.x.com/en/who-we-are/brand-toolkit の `x-logo.zip` に含まれる `logo.svg` | 2026-08-12 |
| `line-icon.png` | LINE | https://developers.line.biz/ja/docs/line-social-plugins/install-guide/using-line-share-buttons/ で配布されている公式「LINEで送る」ボタン画像（丸型・60×60） | 2026-08-12 |

## 加工について

- `line-icon.png` は公式配布物を**無加工**で使用している。
- `x-logo.svg` は公式 zip 内の `logo.svg`（`fill="white"`）の塗り色のみを `black` に変更している。公式ブランドツールキットは白版（`logo-white.png`）と黒版（`logo-black.png`）の両方を配布しており、白背景のボタンに載せるため黒版に揃えた。形状（パスデータ）は一切変更していない。

## 使用上の注意

- ロゴに影やエフェクトをかけない。
- ロゴの周囲に十分な余白を取る（ボタンの padding で確保している）。
- 各社のブランドガイドラインは更新されうるため、アセットを差し替える際は上記の公式配布元を再確認する。

## Facebook について

Meta の公式アセットは Brand Resource Center（https://www.meta.com/brand/resources/facebook/logo/ ）が配布しているが、
CDN が署名付き URL でブラウザセッションを要求するため自動取得できなかった。
公式アセットなしでの掲載は避ける方針のため、Facebook のシェアボタンは設けていない。
