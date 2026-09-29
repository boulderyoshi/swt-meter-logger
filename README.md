# SWT Logger

**v1.0.2 — 正式公開版**

iPhone Safariのカメラを使い、データ出力を持たない機器の数字表示やQRコードを読み取り、CSVへ記録・共有するWebロガーです。

公開URL: https://boulderyoshi.github.io/swt-meter-logger/

## Source of truth

GitHub `main` is the canonical source for this project. Current implementation state and handoff notes are maintained in [PROJECT_STATE.md](./PROJECT_STATE.md).

## 主な機能

- 数字OCR
  - 整数
  - 小数 1〜5桁
  - 手動読取 / 自動読取
  - 画面変化連動 / 1〜300秒タイマー
- QRコード読取
  - 連続スキャン
  - 重複登録防止
  - 難読時の最良フレーム選択・局所コントラスト補正・追加デコーダ
  - 読取成功時の緑フラッシュと成功音
- 読取範囲
  - 数字用 / QR用を個別保存
  - 横位置・縦位置・幅・高さを調整
- CSV出力
  - 1行形式
  - 表形式
  - 行・列の自動採番
  - 空白セル / 任意改行
- テストモード
  - 保存済み設定で読取テスト
  - データ保存なし
- 操作
  - 最近5件の記録
  - 1つ戻す
  - iOS共有シート
  - CSVファイル保存

## 使い方

1. Safariで公開URLを開く
2. 必要に応じて上部メニューで読取対象・範囲・方式・出力方法を設定
3. 「カメラ接続」
4. 「読み取り開始」または手動の「撮影」
5. 終了後に「共有」または「ファイル保存」

iPhoneのホーム画面へ追加すると、Webアプリとして起動できます。

## 対応環境

主対象は **iPhone Safari** です。

カメラ利用のためHTTPSが必要です。GitHub Pagesの公開URLではHTTPSで配信されます。

## データとプライバシー

カメラ映像・OCR対象画像・QR画像は、アプリ自身のサーバーへアップロードしません。読取処理はブラウザ内で行います。

設定はブラウザのlocalStorageへ保存します。CSVの共有・保存はユーザー操作時のみ実行します。

詳細は [PRIVACY.md](./PRIVACY.md) を参照してください。

## 制約

- Safariをバックグラウンドへ送った場合や画面ロック中の継続監視は保証されません。
- カメラ性能、照明、液晶のコントラスト、QRコードの印刷品質によって読取精度は変化します。
- 一部のOCR/QRライブラリやWASMは外部CDNから読み込みます。
- Excel固有のテーブル書式・色・罫線はCSVには含まれません。

## Version

- Current: **v1.0.2**
- Release date: 2026-09-29

変更履歴は [CHANGELOG.md](./CHANGELOG.md) を参照してください。
