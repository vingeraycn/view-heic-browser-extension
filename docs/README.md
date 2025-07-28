# 📖 Documentation / 文档

这个目录包含了 View HEIC 浏览器扩展的官网页面和测试文件。

## 📁 文件结构

```
docs/
├── index.html          # 🏠 官网首页（GitHub Pages 主页）
├── test-improved.html  # 🧪 详细功能测试页面
├── README.md          # 📋 本说明文件
└── *.heic             # 🖼️ 测试用的 HEIC 图片文件
```

## 🌐 GitHub Pages 配置

这个项目配置为从 `/docs` 目录部署 GitHub Pages：

1. **启用 GitHub Pages**：

   - 进入仓库的 `Settings` 页面
   - 滚动到 `Pages` 部分
   - 在 `Source` 下选择 `Deploy from a branch`
   - 选择 `main` 分支和 `/docs` 文件夹
   - 点击 `Save` 保存设置

2. **访问网站**：
   - 官网地址：`https://yourusername.github.io/view-heic-browser-extension/`
   - 测试页面：`https://yourusername.github.io/view-heic-browser-extension/test-improved.html`

## 🏠 官网首页 (index.html)

主要功能：

- 📋 项目介绍和核心特性展示
- 📦 安装指南（应用商店 + 开发者安装）
- 🎬 HEIC 图片功能演示
- 🧪 交互式测试功能
- 🔧 技术栈说明
- 📊 实时转换统计

## 🧪 测试页面 (test-improved.html)

专门用于详细测试的页面：

- 📷 静态 HEIC 图片测试
- 🔄 动态加载测试
- 📈 转换性能监控
- 🐛 错误处理验证
- 📹 Live Photos 功能测试

## 🖼️ 测试文件说明

| 文件名                 | 大小  | 用途                    |
| ---------------------- | ----- | ----------------------- |
| `example.heic`         | 1.1MB | 大文件性能测试          |
| `small-test.heic`      | 873KB | Nokia 标准格式测试      |
| `medium-test.heic`     | 219KB | 小文件快速转换测试      |
| `live-photo-test.heic` | 219KB | Live Photo 动态效果测试 |
| `corrupted-test.heic`  | 78B   | 错误处理和异常测试      |

## 📸 多图 HEIC 功能

**专业的多图 HEIC 检测与展开**：

- 使用 `heic-decode` 库检测 HEIC 文件中的图像数量
- 如果文件包含多个图像，自动显示多图标识（如"📸 4 张"）
- 点击图片展开显示所有图片，网格布局展示
- 再次点击任意图片或标题可收起折叠
- 支持悬浮放大效果和流畅的展开/折叠动画

**交互体验**：

- 🔍 **智能检测**：不再依赖文件名判断，而是分析 HEIC 内部结构
- 📸 **一键展开**：点击显示多图标识的图片即可展开查看所有图像
- 🎨 **网格布局**：最多 4 列网格显示，自适应图片数量
- ⚡ **性能优化**：缓存检测结果，避免重复网络请求
- 🧹 **资源管理**：自动清理生成的图像资源
- 🎯 **用户友好**：避免了"Live Photo"概念混淆，更直观易懂

## 🛠️ 本地开发

启动本地开发服务器：

```bash
# 启动开发服务器
pnpm run test:server

# 打开官网首页
pnpm run dev:open

# 打开测试页面
pnpm run test:open
```

服务器会在 `http://127.0.0.1:8080` 启动，并自动打开浏览器。

## 📝 更新流程

1. **修改页面内容**：编辑 `index.html` 或 `test-improved.html`
2. **本地测试**：使用 `pnpm run test:server` 验证更改
3. **提交更改**：推送到 GitHub 主分支
4. **自动部署**：GitHub Pages 会自动更新网站

## 🚀 最新更新 (ESM + 多图展开)

**Node.js 现代化**：

- ✅ 将 `test-server.js` 升级为 ESM 模块格式
- ✅ 使用 `import` 替代 `require`，符合 Node.js 最新规范
- ✅ 添加 `fileURLToPath` 处理 `__dirname` 兼容性

**多图 HEIC 专业处理**：

- ✅ 集成 `heic-decode` 库进行多图像检测
- ✅ 基于 HEIC 文件内部结构判断是否包含多张图片
- ✅ 点击展开网格显示所有图片，替代动画播放方式
- ✅ 智能缓存和资源管理
- ✅ 避免"Live Photo"概念混淆，用户体验更直观

---

✨ 这个文档目录既作为项目官网，也提供了完整的测试环境，方便开发者和用户了解和测试 HEIC 图片转换功能。
