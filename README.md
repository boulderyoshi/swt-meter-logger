# SWT Thickness Logger (Safari MVP)

iPhone Safariで測定器の表示値を一定間隔でOCRし、CSVへ保存する最小版です。

## 機能
- iPhone背面カメラ
- 読み取り枠の幅・高さ・縦位置調整
- Tesseract.jsによる端末内OCR
- 1 / 5 / 10 / 30 / 60秒間隔の連続記録
- OCR失敗も `OCR_ERROR` として記録
- CSV保存

## 重要
カメラ (`getUserMedia`) は原則として HTTPS が必要です。iPhone Safariから `http://PCのIP:ポート` を開く方式ではカメラが使えない場合があります。

## 最短のテスト方法
静的ホスティングへ `index.html`, `styles.css`, `app.js` を置き、HTTPS URLをiPhone Safariで開いてください。
GitHub Pages / Cloudflare Pages / Netlify 等で動作します。

## 初回テスト
1. URLをiPhone Safariで開く
2. 「カメラ開始」→ カメラを許可
3. 白枠へ数字だけが入るようにiPhoneを固定
4. 「1回読む」
5. `133.7` のように読めることを確認
6. 読めたら「連続記録開始」
7. 停止後「CSV保存」

## MVP上の制約
- OCRライブラリをCDNから読み込むため、初回起動時はインターネット接続が必要です。
- Safariをバックグラウンドへ送ったり画面をロックすると、継続記録は保証されません。
- 小数点誤認識の最終調整は実機写真を複数枚使って行う想定です。
