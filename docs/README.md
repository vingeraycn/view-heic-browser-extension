# 📖 Documentation / 文档

这个目录包含了 View HEIC 浏览器扩展的官网页面和测试文件，配置为从 `/docs` 目录部署 GitHub Pages。

## 📁 文件结构

```
docs/
├── index.html          # 🏠 官网首页（GitHub Pages 主页）
├── test-improved.html  # 🧪 开发者详细测试页面
├── README.md          # 📋 本说明文件
└── *.heic             # 🖼️ 测试用的 HEIC 图片文件
```

## 🌐 GitHub Pages 配置

1. 进入仓库 **Settings → Pages**
2. Source 选择 **Deploy from a branch**
3. 选择 `main` 分支和 `/docs` 文件夹，点击 **Save**
4. 等待约 1 分钟，访问：
   - 官网：`https://vingeraycn.github.io/view-heic-browser-extension/`
   - 测试页：`https://vingeraycn.github.io/view-heic-browser-extension/test-improved.html`

## 🏠 官网首页 (index.html)

完整的产品落地页，包含：

- 🎯 Hero 区域：标题、CTA 按钮、信任标语
- 📊 数据亮点栏：50MB 上限、6 种 HEIC 品牌、默认 JPEG 预览、0 数据上传
- ✨ 核心特性：6 张特性卡片
- 🚀 工作原理：三步流程 + 内部转换流程图
- 🎬 实时演示：4 张真实 HEIC 文件 + 动态注入测试 + 转换统计
- 📦 安装指南：应用商店 vs 手动安装对比
- 🔧 技术栈 & 项目结构说明
- ❓ FAQ 折叠面板
- 📣 CTA Banner + 完整页脚

所有 SEO meta 标签（description、OpenGraph、Twitter Card）均已配置。

## 🧪 测试页面 (test-improved.html)

面向开发者的详细测试页面，包含：

- 📷 静态 HEIC 图片测试（4 个场景）
- 🔄 动态加载测试（MutationObserver 验证）
- 📈 实时转换统计
- 🚀 主要改进点说明

## 🖼️ 测试文件

| 文件名                | 大小  | 用途               |
| --------------------- | ----- | ------------------ |
| `example.heic`        | 1.1MB | 大文件性能测试     |
| `small-test.heic`     | 873KB | Nokia 标准格式测试 |
| `medium-test.heic`    | 219KB | 小文件快速转换测试 |
| `corrupted-test.heic` | 78B   | 错误处理和异常测试 |

## 🛠️ 本地预览

```bash
pnpm run test:server   # 启动本地服务器（http://127.0.0.1:8080）
pnpm run dev:open      # 打开官网首页
pnpm run test:open     # 打开测试页面
```
