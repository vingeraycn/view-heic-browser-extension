# view-heic-browser-extension

View HEIC Image as Normal Image in Your Browser

在浏览器中正常显示 HEIC 图片

## 🆕 最新改进 (v1.0.8)

### 主要优化

- ✅ **依赖升级**: 使用 `heic-to@1.2.1` 替代过时的 `heic2any@0.0.4`
- ✅ **内存优化**: 修复内存泄漏，添加资源清理机制
- ✅ **性能提升**: 避免重复处理，限制并发数量，优化 DOM 监听
- ✅ **错误处理**: 增强错误提示，支持点击失败图片查看原图
- ✅ **安全加固**: 添加文件大小限制（50MB），格式验证
- ✅ **代码重构**: 模块化架构，TypeScript 类型安全

### 视觉改进

- 🔄 处理中状态提示
- ✅ 转换成功状态
- ❌ 转换失败提示（可点击查看原图）

## Install It from Store

Install it on Store [View HEIC from Chrome Web Store](https://chromewebstore.google.com/detail/view-heic/kpbcokcekojhfifjkbglcbaiffegecge?authuser=1&hl=en)

## Install Manually

1. Download the extension file and unzip it from the [releases page](https://github.com/vingeraycn/view-heic-browser-extension/releases).
2. Open the browser extension manager (enter chrome://extensions by your address bar).
3. Click "Load unpacked" and select the extension unzipped folder.
4. Refresh your webpage need to view HEIC image.

## 🧪 测试改进版本

### 开发测试

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建扩展
pnpm build

# 打包发布
pnpm zip
```

### 功能测试

1. 打开 `docs/test-improved.html` 测试改进功能
2. 加载扩展到浏览器
3. 观察 HEIC 图片转换过程和状态提示
4. 测试动态加载图片的处理

## 手动安装

1. 下载扩展文件并解压，从[发布页面](https://github.com/vingeraycn/view-heic-browser-extension/releases)。
2. 打开浏览器扩展管理器（在地址栏输入 chrome://extensions）。
3. 点击"加载已解压的扩展程序"，选择解压后的扩展文件夹。
4. 刷新需要查看 HEIC 图片的网页。

## 技术架构

```
view-heic-browser-extension/
├── entrypoints/
│   ├── content.ts          # 主要内容脚本
│   └── background.ts       # 背景脚本
├── utils/
│   ├── constants.ts        # 配置常量
│   ├── types.ts           # TypeScript类型定义
│   └── heic-converter.ts  # HEIC转换核心类
└── docs/
    ├── index.html         # 基础测试页面
    └── test-improved.html # 改进版测试页面
```

## 已知问题解决

### 常见问题

- **CORS 错误**: 部分网站限制跨域访问，扩展会显示错误提示
- **格式识别**: 仅基于文件扩展名(.heic/.heif)识别
- **大文件处理**: 限制 50MB 以内文件，避免内存溢出

### 兼容性

- Chrome/Edge: ✅ 完全支持
- Firefox: ✅ 支持 (需要构建 Firefox 版本)
- Safari: ❌ 不支持扩展 API
