# 🖼️ View HEIC Browser Extension

[![Version](https://img.shields.io/badge/version-1.0.11-blue.svg)](https://github.com/vingeraycn/view-heic-browser-extension)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/typescript-5.5.2-blue.svg)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/tailwind-latest-06B6D4.svg)](https://tailwindcss.com/)

> �� 在浏览器中无缝查看 HEIC 图片，现代化的高性能解决方案

## ✨ 核心特性

### 🎯 智能转换引擎

- **最新技术栈**: 基于 `heic-to@1.5.2` 和 `libheif 1.22.2`
- **零 CORS 问题**: 完美兼容各种网站的跨域策略
- **内存优化**: 自动资源清理，避免内存泄漏
- **高性能处理**: 默认 JPEG 预览、并发限制、智能缓存和阶段耗时日志

### 🛠️ 开发者友好

- **TypeScript**: 完整类型支持，代码可维护性高
- **模块化架构**: 清晰的代码组织和复用性
- **现代化构建**: 基于 WXT 框架的高效开发流程
- **完整测试**: 本地化测试环境，避免网络依赖

## 🚀 快速开始

### 从应用商店安装 (推荐)

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-4285F4?logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/view-heic/kpbcokcekojhfifjkbglcbaiffegecge)

### 手动安装开发版

1. **克隆项目**

   ```bash
   git clone https://github.com/vingeraycn/view-heic-browser-extension.git
   cd view-heic-browser-extension
   ```

2. **安装依赖**

   ```bash
   pnpm install
   ```

3. **构建扩展**

   ```bash
   pnpm build
   ```

4. **加载到浏览器**
   - 打开 `chrome://extensions/`
   - 开启"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择 `.output/chrome-mv3` 文件夹

## 🧪 本地测试

我们提供了完整的本地测试环境，无需依赖外部资源：

```bash
# 启动开发测试服务器 (Node.js)
pnpm run test:server

# 或者完整的开发流程
pnpm run dev:test
```

访问 `http://127.0.0.1:8080/test-improved.html` 进行功能测试。

### 📂 测试文件覆盖

| 文件类型              | 大小  | 测试目的       | 预期结果    |
| --------------------- | ----- | -------------- | ----------- |
| `example.heic`        | 1.1MB | 大文件性能测试 | ✅ 正常转换 |
| `small-test.heic`     | 873KB | Nokia 标准格式 | ✅ 快速转换 |
| `medium-test.heic`    | 219KB | 小文件处理     | ✅ 快速转换 |
| `corrupted-test.heic` | 78B   | 错误处理测试   | ❌ 优雅降级 |

## 🏗️ 项目架构

```
view-heic-browser-extension/
├── 📁 entrypoints/          # 扩展入口点
│   ├── content.ts           # 内容脚本 (核心逻辑)
│   └── background.ts        # 后台脚本
├── 📁 utils/                # 工具模块
│   ├── constants.ts         # 配置常量
│   ├── types.ts            # TypeScript 类型定义
│   └── heic-converter.ts   # HEIC 转换引擎
├── 📁 docs/                 # 测试和文档
│   ├── test-improved.html  # 现代化测试页面 (Tailwind CSS)
│   └── *.heic              # 本地测试文件
├── 📄 test-server.js        # Node.js 测试服务器
└── 📄 wxt.config.ts        # WXT 构建配置
```

## 🎨 技术栈

### 核心技术

- **框架**: [WXT](https://wxt.dev/) - 现代浏览器扩展开发框架
- **语言**: TypeScript 5.5.2
- **转换引擎**: heic-to 1.5.2 (基于 libheif 1.22.2)
- **工具库**: Lodash-ES

### 开发工具

- **样式**: Tailwind CSS (CDN)
- **测试服务器**: Node.js HTTP Server
- **包管理**: pnpm
- **构建**: Vite 5.3.3

## 📊 性能对比

| 指标         | 旧版本 (heic2any) | 新版本 (heic-to) | 提升      |
| ------------ | ----------------- | ---------------- | --------- |
| **库版本**   | 0.0.4 (2 年前)    | 1.5.2 (持续更新) | ✅ 现代化 |
| **包大小**   | 2.59MB            | 2.54MB           | 📉 -2%    |
| **内存管理** | 内存泄漏风险      | 自动清理         | ✅ 优化   |
| **输出策略** | 默认 PNG          | 默认 JPEG 预览   | 🚀 更小、更快展示 |
| **错误处理** | 基础              | 智能分类         | 💡 更智能 |

## 🚦 开发命令

```bash
# 开发模式 (Chrome)
pnpm dev

# 开发模式 (Firefox)
pnpm dev:firefox

# 构建生产版本
pnpm build

# 构建 Firefox 版本
pnpm build:firefox

# 打包发布
pnpm zip

# TypeScript 编译检查
pnpm compile

# 性能策略校验
pnpm verify:performance

# 启动测试服务器
pnpm test:server

# 完整开发测试流程
pnpm dev:test
```

## 🐛 故障排除

### 常见问题

**Q: 图片无法转换？**
A: 检查控制台错误，确保：

- 扩展已正确加载
- HEIC 文件格式有效
- 文件大小在 50MB 以内

**Q: 测试页面无法访问？**
A: 确保测试服务器正在运行：

```bash
pnpm run test:server
```

**Q: CORS 错误？**
A: 使用本地测试服务器而非 `file://` 协议

### 调试技巧

1. **开启详细日志**: 打开浏览器控制台查看转换日志
2. **网络面板**: 检查 HEIC 文件加载状态
3. **扩展面板**: 在 `chrome://extensions/` 检查扩展状态

## 🤝 贡献指南

我们欢迎各种形式的贡献！

1. **Fork** 项目
2. **创建特性分支** (`git checkout -b feature/amazing-feature`)
3. **提交更改** (`git commit -m 'Add amazing feature'`)
4. **推送分支** (`git push origin feature/amazing-feature`)
5. **创建 Pull Request**

### 开发规范

- 使用 TypeScript 严格模式
- 遵循 ESLint 配置
- 添加适当的类型注解
- 更新相关文档

## 📜 更新日志

查看 [CHANGELOG.md](CHANGELOG.md) 了解详细的版本历史。

### 最新版本 v1.0.11 🆕

- ✅ 升级到 heic-to@1.5.2 (基于 libheif 1.22.2)
- ✅ 重构为 TypeScript 模块化架构
- ✅ 集成 Tailwind CSS 现代化 UI
- ✅ Node.js 测试服务器替代 Python
- ✅ 完整的本地测试环境
- ✅ 内存泄漏修复和性能优化
- ✅ 优化默认 JPEG 预览与 HEIC src 变更处理

## 📄 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。

## 🙏 致谢

- [Nokia HEIF](https://github.com/nokiatech/heif) - 提供测试文件
- [libheif](https://github.com/strukturag/libheif) - 核心转换引擎
- [WXT Framework](https://wxt.dev/) - 现代扩展开发框架
- [Tailwind CSS](https://tailwindcss.com/) - 实用优先的 CSS 框架

---

<div align="center">

**[🌟 给个 Star](https://github.com/vingeraycn/view-heic-browser-extension) • [🐛 报告问题](https://github.com/vingeraycn/view-heic-browser-extension/issues) • [💡 功能建议](https://github.com/vingeraycn/view-heic-browser-extension/issues)**

Made with ❤️ by [vingeray](https://github.com/vingeraycn)

</div>
