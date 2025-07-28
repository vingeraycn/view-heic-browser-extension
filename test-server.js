#!/usr/bin/env node

import { spawn } from "child_process"
import fs from "fs"
import http from "http"
import path from "path"
import { fileURLToPath } from "url"

// ESM 中获取当前文件目录的方法
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = 8080
const DOCS_DIR = path.join(__dirname, "docs")
const SITE_URL = `http://127.0.0.1:${PORT}/`
const TEST_URL = `http://127.0.0.1:${PORT}/test-improved.html`

// MIME类型映射
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".md": "text/markdown",
}

// 跨平台打开浏览器
function openBrowser(url) {
  const platform = process.platform
  let command

  switch (platform) {
    case "darwin": // macOS
      command = "open"
      break
    case "win32": // Windows
      command = "start"
      break
    default: // Linux等
      command = "xdg-open"
  }

  try {
    spawn(command, [url], { detached: true, stdio: "ignore" }).unref()
    console.log(`🌐 已尝试在默认浏览器中打开: ${url}`)
  } catch (error) {
    console.log(`⚠️  无法自动打开浏览器，请手动访问: ${url}`)
  }
}

const server = http.createServer((req, res) => {
  // 处理CORS
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate")

  if (req.method === "OPTIONS") {
    res.writeHead(200)
    res.end()
    return
  }

  // 默认页面重定向
  let filePath = path.join(DOCS_DIR, req.url === "/" ? "index.html" : req.url)

  // 安全检查，防止目录遍历
  if (!filePath.startsWith(DOCS_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" })
    res.end("Forbidden")
    return
  }

  // 处理查询参数（去除）
  const urlWithoutQuery = filePath.split("?")[0]

  fs.readFile(urlWithoutQuery, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        // 404处理
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" })
        res.end(`
          <html>
            <head><title>404 - 文件未找到</title></head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; text-align: center;">
              <h1>🔍 文件未找到</h1>
              <p>请求的文件 <code>${req.url}</code> 不存在</p>
              <p><a href="/">返回首页</a> | <a href="/test-improved.html">测试页面</a></p>
            </body>
          </html>
        `)
      } else {
        res.writeHead(500, { "Content-Type": "text/plain" })
        res.end("Server error: " + err.message)
      }
      return
    }

    const ext = path.extname(urlWithoutQuery).toLowerCase()
    const contentType = mimeTypes[ext] || "application/octet-stream"

    res.setHeader("Content-Type", contentType)
    res.writeHead(200)
    res.end(content)
  })
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n🚀 HEIC扩展开发服务器已启动:`)
  console.log(`   官网首页: ${SITE_URL}`)
  console.log(`   测试页面: ${TEST_URL}`)
  console.log(`   文档目录: ${DOCS_DIR}`)
  console.log(`   Node.js版本: ${process.version}`)
  console.log(`\n📋 可用的测试文件:`)

  // 列出HEIC测试文件
  try {
    const files = fs.readdirSync(DOCS_DIR)
    const heicFiles = files.filter((f) => f.endsWith(".heic"))
    heicFiles.forEach((file) => {
      const stats = fs.statSync(path.join(DOCS_DIR, file))
      const size = (stats.size / 1024).toFixed(1) + "KB"
      console.log(`   📷 ${file} (${size})`)
    })
  } catch (error) {
    console.log(`   ⚠️  无法读取docs目录`)
  }

  console.log(`\n💡 使用说明:`)
  console.log(`   🏠 官网首页: 项目介绍和功能演示`)
  console.log(`   🧪 测试页面: 详细的功能测试环境`)
  console.log(`   1. 确保浏览器扩展已加载`)
  console.log(`   2. 访问页面观察HEIC图片转换效果`)
  console.log(`   3. 按 Ctrl+C 停止服务器`)

  // 延迟2秒后自动打开浏览器
  setTimeout(() => {
    openBrowser(SITE_URL)
  }, 2000)
})

// 优雅关闭
process.on("SIGINT", () => {
  console.log("\n\n👋 正在关闭服务器...")
  server.close(() => {
    console.log("✅ 服务器已关闭")
    process.exit(0)
  })
})

process.on("SIGTERM", () => {
  console.log("\n👋 收到终止信号，正在关闭服务器...")
  server.close(() => {
    console.log("✅ 服务器已关闭")
    process.exit(0)
  })
})
