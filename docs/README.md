# 📖 Documentation / 文档

这个目录包含了 View HEIC 浏览器扩展的官网页面和测试文件，配置为从 `/docs` 目录部署 GitHub Pages。

## 📁 文件结构

```
docs/
├── assets/
│   └── logo.svg        # 🎨 官网与市场素材共享 Logo
├── store-assets/       # 🛍️ 应用市场截图素材（1280×800 PNG + SVG 源文件）
├── index.html          # 🏠 官网首页（GitHub Pages 主页）
├── test-improved.html  # 🧪 开发者详细测试页面
├── README.md          # 📋 本说明文件
└── samples/           # 🖼️ 测试用的 HEIC / HEIF 样本矩阵
```

## 🌐 GitHub Pages 配置

1. 进入仓库 **Settings → Pages**
2. Source 选择 **Deploy from a branch**
3. 选择 `main` 分支和 `/docs` 文件夹，点击 **Save**
4. 等待约 1 分钟，访问：
   - 官网：`https://vingeraycn.github.io/view-heic-browser-extension/`
   - 测试页：`https://vingeraycn.github.io/view-heic-browser-extension/test-improved.html`

## 🏠 官网首页 (index.html)

完整的中英双语产品落地页，默认英文，可通过右上角语言切换入口在英文和中文之间切换：

- 🎯 Hero 区域：标题、CTA 按钮、信任标语
- 📊 数据亮点栏：50MB 上限、HEIC/HEIF brand 覆盖、默认 JPEG 预览、0 数据上传
- ✨ 核心特性：6 张特性卡片
- 🚀 工作原理：三步流程 + 内部转换流程图
- 🎬 实时演示：4 张真实 HEIC 文件 + 动态注入测试 + 转换统计
- 📦 安装指南：应用商店 vs 手动安装对比
- 🔧 技术栈 & 项目结构说明
- ❓ FAQ 折叠面板
- 📣 CTA Banner + 完整页脚

SEO meta 标签（description、OpenGraph、Twitter Card）和 `hreflang` 均已配置，语言 URL 使用：

- 英文：`https://vingeraycn.github.io/view-heic-browser-extension/?lang=en`
- 中文：`https://vingeraycn.github.io/view-heic-browser-extension/?lang=zh`

## 🛍️ 应用市场素材

市场素材由项目脚本统一生成，避免 Logo、扩展图标和截图风格漂移：

```bash
pnpm assets:market
```

生成内容：

- `docs/assets/logo.svg`
- `public/icon/32.png`
- `public/icon/48.png`
- `public/icon/96.png`
- `public/icon/128.png`
- `docs/store-assets/01-browser-heic-preview.png`
- `docs/store-assets/02-local-private-conversion.png`
- `docs/store-assets/03-fast-jpeg-rendering.png`

## 🧪 测试页面 (test-improved.html)

面向开发者的详细测试页面，包含：

- 📷 静态 HEIC 图片测试（brand、MIME、query/hash、错误文件等场景）
- 🔄 动态加载测试（MutationObserver 验证）
- 📈 实时转换统计
- 🚀 主要改进点说明

## 🖼️ 测试文件

| 文件名 | 覆盖点 |
| --- | --- |
| `samples/heic-still.heic` | major `heic` |
| `samples/mif1-still.heic` | major `mif1` |
| `samples/msf1-sequence.heic` | major `msf1` |
| `samples/heix-compatible.heic` | compatible `heix` |
| `samples/hevx-compatible-sequence.heic` | compatible `hevx` |
| `samples/heis-multilayer.heic` | major `heis` |
| `samples/corrupted-test.heic` | 错误处理和异常测试 |

完整来源和缺口见 `samples/README.md`。

## 🛠️ 本地预览

```bash
pnpm run test:server   # 启动本地服务器（http://127.0.0.1:8080）
pnpm run dev:open      # 打开官网首页
pnpm run test:open     # 打开测试页面
```
