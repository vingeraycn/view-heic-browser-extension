#!/usr/bin/env node

const http = require("http")
const fs = require("fs")
const path = require("path")

const PORT = 8080
const DOCS_DIR = path.join(__dirname, "docs")

// MIME类型映射
const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
}

const server = http.createServer((req, res) => {
  // 处理CORS
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    res.writeHead(200)
    res.end()
    return
  }

  let filePath = path.join(DOCS_DIR, req.url === "/" ? "test-improved.html" : req.url)

  // 安全检查，防止目录遍历
  if (!filePath.startsWith(DOCS_DIR)) {
    res.writeHead(403)
    res.end("Forbidden")
    return
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404)
        res.end("File not found")
      } else {
        res.writeHead(500)
        res.end("Server error")
      }
      return
    }

    const ext = path.extname(filePath)
    const contentType = mimeTypes[ext] || "application/octet-stream"

    res.setHeader("Content-Type", contentType)
    res.writeHead(200)
    res.end(content)
  })
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`🚀 测试服务器已启动:`)
  console.log(`   本地地址: http://127.0.0.1:${PORT}/test-improved.html`)
  console.log(`   文档目录: ${DOCS_DIR}`)
  console.log(`\n💡 测试步骤:`)
  console.log(`   1. 确保浏览器扩展已加载`)
  console.log(`   2. 打开上述链接测试HEIC转换`)
  console.log(`   3. 观察转换状态和错误处理`)
  console.log(`\n按 Ctrl+C 停止服务器`)
})

// 优雅关闭
process.on("SIGINT", () => {
  console.log("\n👋 服务器已关闭")
  server.close()
  process.exit(0)
})
