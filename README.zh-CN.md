# View HEIC 浏览器扩展

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](https://github.com/vingeraycn/view-heic-browser-extension)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-4285F4?logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/view-heic/kpbcokcekojhfifjkbglcbaiffegecge)

阅读 [English README](README.md)。

View HEIC 帮助 Chrome 显示和上传网页里的 iPhone HEIC / HEIF 照片。扩展会识别疑似 HEIC / HEIF 图片，在浏览器本地完成转换，并把原图或上传文件替换成浏览器友好的 JPEG。

## 功能

- 通过扩展名、MIME 类型和文件头自动检测页面已有和动态插入的 HEIC / HEIF 图片。
- 在网页上传控件选择 HEIC / HEIF 文件时，先转成 JPEG，再交给页面上传流程。
- 使用 `heic-to` 和 libheif 在浏览器本地转换图片。
- 默认输出 JPEG 预览，提升渲染速度并减少输出体积。
- 支持图片 `src` 变更、重试、大小限制、不支持变体和常见错误状态处理。
- 转换后的图片数据只保存在当前标签页内存中，不上传图片内容或图片地址。
- 在多次成功转换后展示轻量的应用商店评价入口。

## 安装

推荐从 [Chrome Web Store](https://chromewebstore.google.com/detail/view-heic/kpbcokcekojhfifjkbglcbaiffegecge) 安装。

本地开发安装：

```bash
git clone https://github.com/vingeraycn/view-heic-browser-extension.git
cd view-heic-browser-extension
pnpm install
pnpm build
```

然后打开 `chrome://extensions/`，启用“开发者模式”，点击“加载已解压的扩展程序”，选择 `.output/chrome-mv3`。

## 开发

```bash
pnpm compile
pnpm test
pnpm verify:heif-detection
pnpm verify:rating-prompt
pnpm verify:analytics-events
pnpm verify:upload-conversion
pnpm verify:performance
pnpm verify:src-change
pnpm build
pnpm zip
```

启动本地测试服务：

```bash
pnpm test:server
```

访问 `http://127.0.0.1:8080/test-improved.html`，使用本地 HEIC 测试文件验证转换行为。

## 项目结构

```text
view-heic-browser-extension/
├── analytics-worker/        # 第一方 GA4 事件代理
├── entrypoints/
│   ├── background.ts
│   ├── content.ts
│   ├── converter/
│   └── popup/
├── utils/
│   ├── analytics.ts
│   ├── analytics-transport.ts
│   ├── constants.ts
│   ├── heic-converter.ts
│   └── types.ts
├── docs/
│   ├── index.html
│   ├── test-improved.html
│   └── samples/
├── scripts/
└── wxt.config.ts
```

## 权限说明

View HEIC 使用 `storage` 权限保存网站开关、评价提示状态和数据共享偏好。图片转换始终完全在浏览器本地完成。扩展默认会使用随机生成的假名化安装标识，通过第一方校验代理向 Google Analytics 发送粗粒度产品事件，范围包括插件是否发生真实活动、功能入口、一次转换流程的汇总结果和评价提示操作。事件绝不包含图片内容、图片或页面地址、网站域名、文件名、浏览历史、表单内容或转换后的图片数据。用户可随时在 Popup 中关闭“共享基本使用数据”；关闭后，本地分析标识也会一并删除。详见[隐私政策](docs/privacy.html)与[埋点规范](docs/analytics.md)。

## 最新版本

### v1.4.0

- 围绕“每日活跃安装量”和“一次真实转换流程一条事件”重建产品埋点。
- 补齐版本、使用入口、触发方式、转换结果、耗时和批量结果维度，不采集页面或文件身份。
- Popup 新增清晰的数据共享开关；关闭时删除本地假名化标识。
- 从扩展包移除 Google Analytics 密钥，改由严格校验的第一方边缘代理转发。

### v1.3.0

- 新增精致的 Popup，提供页面状态、网站开关、帮助入口与本地文件转换。
- 改进 Gemini 的 HEIC / HEIF 上传兼容，同时保留既有 ChatGPT 工作流。
- 让转换失败稳定结束，避免 loading 与重试循环反复出现。
- 首次安装默认打开英文引导，并让帮助链接跟随 Popup 语言。

### v1.0.12

- 在累计多次成功转换后新增本地化的 Chrome Web Store 评价入口。
- 增加本地频控，避免重复打扰用户。
- 为提示增加进入和退出缓动动画。
- Firefox 构建中不展示 Chrome Web Store 评价入口。

完整版本记录见 [CHANGELOG.md](CHANGELOG.md)。

## 故障排除

如果图片无法显示：

- 确认扩展已启用。
- 安装后刷新页面。
- 确认文件是有效的 HEIC / HEIF 图片。
- 确认图片大小没有超过默认 50 MB 限制。
- 有些网站会阻止扩展读取图片字节；这种情况下 View HEIC 无法在页面内完成转换。
- 打开浏览器控制台查看 View HEIC 日志。

## 许可证

MIT。见 [LICENSE](LICENSE)。

## 致谢

- [libheif](https://github.com/strukturag/libheif)
- [heic-to](https://github.com/hoppergee/heic-to)
- [WXT](https://wxt.dev/)
- [Nokia HEIF](https://github.com/nokiatech/heif)
