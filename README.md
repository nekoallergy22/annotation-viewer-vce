# Annotation Viewer for VS Code

高機能な画像アノテーション表示・閲覧ツール。機械学習・コンピュータビジョンの研究開発に最適化されたVS Code拡張機能です。

![Version](https://img.shields.io/badge/version-0.0.1-blue)
![Platform](https://img.shields.io/badge/platform-VS%20Code-green)
![Format](https://img.shields.io/badge/format-COCO%20JSON-orange)

## ✨ 主な機能

### 🖼️ 高精度画像表示
- **大画面表示**: 95%×90%の大型表示エリア
- **精密ズーム**: 0.1〜5倍の滑らかなズーム機能
- **インテリジェントパン**: ズーム時の直感的なドラッグ操作
- **複数形式対応**: JPG, PNG, GIF, BMP, WebP, SVG

### 🎯 アノテーション表示
- **COCOフォーマット**: 業界標準のアノテーション形式に対応
- **リアルタイム描画**: バウンディングボックス + カテゴリラベル
- **ズーム同期**: 画像拡大に完全連動したアノテーション表示
- **8色配色**: カテゴリ別の自動色分け
- **ワンクリック切替**: 表示/非表示の即座切り替え

### 🎬 スライドショー
- **4段階速度**: 0.1s, 0.5s, 1s, 2s（デフォルト: 0.1s）
- **無限リピート**: 連続閲覧に最適（デフォルト: ON）
- **柔軟制御**: 再生中の速度変更・画像ジャンプ
- **キーボード対応**: スペースキーで再生/停止

### 📊 統計情報
- 総画像数・総アノテーション数の一覧表示
- 現在画像のアノテーション詳細
- カテゴリ別集計情報

## 🚀 インストール

### 開発環境での利用
```bash
# リポジトリをクローン
git clone <repository-url>
cd annotation-viewer

# 依存関係をインストール
npm install

# 拡張機能をコンパイル
npm run compile

# VS Codeで開発モードで起動
# F5キーを押してExtension Development Hostを起動
```

### VSIXパッケージからのインストール
```bash
# VSIXファイルからインストール
code --install-extension annotation-viewer-0.0.1.vsix
```

## 📖 使用方法

### 基本的な使い方

1. **フォルダから起動**
   ```
   images/ フォルダを右クリック
   → "Open Annotation Viewer"
   ```

2. **複数ファイル選択**
   ```
   Ctrl+クリックで以下を選択:
   - images/ フォルダ
   - annotations.json ファイル
   → 右クリック → "Open Annotation Viewer (Selected Files)"
   ```

3. **コマンドパレット**
   ```
   Ctrl+Shift+P
   → "Annotation Viewer: Open Viewer"
   ```

### 操作方法

#### マウス操作
| 操作 | 機能 |
|------|------|
| **サムネイルクリック** | フルスクリーン表示 |
| **縦ドラッグ** | ズームイン/アウト |
| **横ドラッグ** | パン（拡大時のみ） |
| **ホイール** | ズーム操作 |
| **背景クリック** | フルスクリーン終了 |

#### キーボード操作
| キー | 機能 |
|------|------|
| **←/→** | 前/次の画像 |
| **スペース** | スライドショー再生/停止 |
| **ESC** | フルスクリーン終了 |

#### フルスクリーンコントロール
- **ナビゲーション**: ←/→ボタン、画像スライダー
- **スライドショー**: ▶ボタン、速度選択、Repeat切替
- **アノテーション**: Annotations ON/OFF切替

## 📁 データ形式

### 推奨ディレクトリ構造
```
project/
├── images/                 # 画像フォルダ
│   ├── 000000001.jpg
│   ├── 000000002.jpg
│   ├── 000000003.jpg
│   └── ...
└── annotations.json        # COCOフォーマットのアノテーション
```

### COCOアノテーションフォーマット
```json
{
  "info": {
    "description": "My Dataset",
    "version": "1.0",
    "year": 2024
  },
  "images": [
    {
      "id": 1,
      "file_name": "000000001.jpg",
      "width": 640,
      "height": 480
    }
  ],
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 1,
      "bbox": [50, 100, 200, 150],  // [x, y, width, height]
      "area": 30000,
      "iscrowd": 0
    }
  ],
  "categories": [
    {
      "id": 1,
      "name": "person",
      "supercategory": "human"
    }
  ]
}
```

## ⚙️ 技術仕様

### 対応形式
- **画像**: JPG, JPEG, PNG, GIF, BMP, WebP, SVG
- **アノテーション**: COCO JSON形式

### パフォーマンス
- **大量画像対応**: 1000枚以上の画像セットで動作確認済み
- **効率的描画**: 必要時のみアノテーション再描画
- **メモリ最適化**: 遅延読み込みによるメモリ使用量削減

### 制限事項
- JSONアノテーションファイルは1つまで
- COCO形式のみ対応（YOLO形式は今後対応予定）

## 🛠️ 開発

### 開発環境
- Node.js 16.x以上
- TypeScript 4.9.x
- VS Code Extension API 1.74.0以上

### ビルド
```bash
# TypeScriptコンパイル
npm run compile

# ウォッチモード（開発時）
npm run watch

# VSIXパッケージ作成
vsce package
```

### デバッグ
```bash
# Extension Development Hostで起動
F5キー

# ログ出力確認
Developer Tools → Console
```

## 🤝 貢献

### バグレポート
問題を発見した場合は、以下の情報を含めてIssueを作成してください：
- VS Codeバージョン
- 使用OS
- 画像ファイル形式・サイズ
- アノテーションファイルサイズ
- 再現手順

### 機能要求
新機能の提案は歓迎します。以下を含めてください：
- 用途・必要性
- 期待する動作
- 参考となる類似ツール

## 📝 ライセンス

このプロジェクトはMITライセンスの下で配布されています。

## 🔗 関連リンク

- [VS Code Extension API](https://code.visualstudio.com/api)
- [COCO Dataset Format](https://cocodataset.org/#format-data)
- [TypeScript](https://www.typescriptlang.org/)

---

**開発者**: Claude Code Assistant  
**最終更新**: 2024年6月  
**バージョン**: 0.0.1