import { createReadStream, readFileSync, statSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join, normalize } from "node:path"

const port = Number(process.env.VIEW_HEIC_PREVIEW_PORT ?? 4177)
const outputDirectory = normalize(join(process.cwd(), ".output/chrome-mv3"))
const referenceImagePath = process.env.VIEW_HEIC_REFERENCE_IMAGE

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
}

function isRegularFile(filePath) {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}

const popupPreviewShim = `
<script>
  (() => {
    const params = new URLSearchParams(location.search);
    if (params.get("lang") === "zh") {
      Object.defineProperty(navigator, "language", { value: "zh-CN", configurable: true });
    }
    const phase = params.get("state") || "idle";
    const counts = phase === "converting"
      ? { detected: 2, converted: 0, failed: 0 }
      : phase === "complete"
        ? { detected: 2, converted: 2, failed: 0 }
        : phase === "error"
          ? { detected: 2, converted: 1, failed: 1 }
          : { detected: 0, converted: 0, failed: 0 };
    let state = {
      protocol: 1,
      extensionVersion: "1.2.0",
      pageInstanceId: "popup-preview",
      siteHost: "example.com",
      siteEnabled: phase !== "disabled",
      phase,
      ...counts,
    };
    const listeners = new Set();
    globalThis.browser = {
      runtime: {
        id: "view-heic-preview",
        getURL: (path) => path,
        onMessage: {
          addListener: (listener) => listeners.add(listener),
          removeListener: (listener) => listeners.delete(listener),
        },
      },
      tabs: {
        query: async () => [{ id: 1, url: "https://example.com/gallery" }],
        sendMessage: async (_tabId, message) => {
          if (message.type === "view-heic:site-enabled:set") {
            state = {
              ...state,
              siteEnabled: message.enabled,
              phase: message.enabled ? "idle" : "disabled",
              detected: 0,
              converted: 0,
              failed: 0,
            };
            return { ok: true, state };
          }
          return state;
        },
        reload: async () => {},
        create: async () => {},
      },
    };
  })();
</script>`

createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://127.0.0.1:${port}`)
  const pathname = requestUrl.pathname === "/" ? "/popup.html" : requestUrl.pathname

  if (pathname === "/reference.png") {
    if (!referenceImagePath || !isRegularFile(referenceImagePath)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      response.end("Set VIEW_HEIC_REFERENCE_IMAGE to enable visual comparison.")
      return
    }

    const imageStream = createReadStream(referenceImagePath)
    imageStream.once("error", () => {
      if (!response.headersSent) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
        response.end("Reference image is unavailable.")
      } else {
        response.destroy()
      }
    })
    response.setHeader("Content-Type", "image/png")
    imageStream.pipe(response)
    return
  }

  if (pathname === "/converter-frame.html") {
    response.setHeader("Content-Type", "text/html; charset=utf-8")
    response.end(`<!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>View HEIC converter test frame</title>
          <style>
            html, body, iframe { width: 100%; height: 100%; margin: 0; border: 0; }
          </style>
        </head>
        <body><iframe src="/converter.html" title="View HEIC converter"></iframe></body>
      </html>`)
    return
  }

  if (pathname === "/comparison.html") {
    const referenceMarkup =
      referenceImagePath && isRegularFile(referenceImagePath)
        ? `<figure>
              <figcaption>Reference</figcaption>
              <img class="frame" src="/reference.png" alt="Approved popup reference">
            </figure>`
        : ""
    response.setHeader("Content-Type", "text/html; charset=utf-8")
    response.end(`<!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>View HEIC popup comparison</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 32px;
              background: #e8e6e1;
              color: #10243b;
              font: 600 14px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            main { display: flex; align-items: flex-start; justify-content: center; gap: 32px; }
            figure { margin: 0; }
            figcaption { margin-bottom: 8px; }
            .frame {
              display: block;
              width: 360px;
              height: 392px;
              overflow: hidden;
              border: 0;
              border-radius: 0;
              background: #faf8f4;
              box-shadow: 0 1px 4px rgb(16 36 59 / 12%);
            }
            img.frame { object-fit: fill; }
          </style>
        </head>
        <body>
          <main>
            ${referenceMarkup}
            <figure>
              <figcaption>Implementation</figcaption>
              <iframe class="frame" src="/popup.html?state=idle" title="Implemented popup"></iframe>
            </figure>
          </main>
        </body>
      </html>`)
    return
  }

  const filePath = normalize(join(outputDirectory, pathname))

  if (!filePath.startsWith(outputDirectory)) {
    response.writeHead(403)
    response.end("Forbidden")
    return
  }

  try {
    const stats = statSync(filePath)
    if (!stats.isFile()) throw new Error("Not a file")

    response.setHeader("Cache-Control", "no-store")
    response.setHeader("Content-Type", contentTypes[extname(filePath)] ?? "application/octet-stream")

    if (pathname === "/popup.html") {
      const html = readFileSync(filePath, "utf8").replace("</head>", `${popupPreviewShim}</head>`)
      response.end(html)
      return
    }

    createReadStream(filePath).pipe(response)
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
    response.end("Not found")
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`View HEIC UI preview: http://127.0.0.1:${port}/popup.html`)
})
