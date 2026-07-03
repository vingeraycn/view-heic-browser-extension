# View HEIC 浏览器扩展

[![Version](https://img.shields.io/badge/version-1.0.15-blue.svg)](https://github.com/vingeraycn/view-heic-browser-extension)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-4285F4?logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/view-heic/kpbcokcekojhfifjkbglcbaiffegecge)

阅读 [English README](README.md)。

View HEIC 帮助 Chrome 显示网页里的 iPhone HEIC / HEIF 照片。扩展会识别疑似 HEIC / HEIF 图片，在浏览器本地完成转换，并把原图替换成可直接渲染的 JPEG 预览。

## 功能

- 通过扩展名、MIME 类型和文件头自动检测页面已有和动态插入的 HEIC / HEIF 图片。
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
pnpm verify:heif-detection
pnpm verify:rating-prompt
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
├── entrypoints/
│   ├── content.ts
│   └── background.ts
├── utils/
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

View HEIC 使用 `storage` 权限保存评价提示相关的本地状态，例如用户是否已经关闭或点击过提示。图片转换仍然完全在浏览器本地完成。发布版本启用扩展分析时，View HEIC 会发送匿名产品事件，例如转换成功/失败和评价提示点击。扩展不会上传图片内容、图片地址、页面地址、文件名、浏览历史或转换后的图片数据。

## 最新版本

### v1.0.15

- 新增匿名转换与评价漏斗埋点，用于判断发布后的真实使用链路。
- 图片仍在浏览器本地转换，埋点不包含图片内容、图片地址、页面地址、文件名、浏览历史或转换后的图片。
- 收紧埋点事件校验，并让评价提示按钮不被网络请求阻塞。

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
