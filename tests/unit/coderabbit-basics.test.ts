import { spawn, type ChildProcess } from "node:child_process"
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url))
const previewScriptPath = join(repositoryRoot, "scripts/preview-built-ui.mjs")
const runningChildren = new Set<ChildProcess>()
const temporaryDirectories = new Set<string>()

async function readRepositoryFile(relativePath: string): Promise<string> {
  return readFile(join(repositoryRoot, relativePath), "utf8")
}

async function getAvailablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })

  const address = server.address()
  if (!address || typeof address === "string") {
    server.close()
    throw new Error("Could not reserve a preview-server port")
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  return address.port
}

async function startPreviewServer(referenceImagePath: string): Promise<{
  child: ChildProcess
  origin: string
}> {
  const port = await getAvailablePort()
  const child = spawn(process.execPath, [previewScriptPath], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      VIEW_HEIC_PREVIEW_PORT: String(port),
      VIEW_HEIC_REFERENCE_IMAGE: referenceImagePath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  runningChildren.add(child)

  await new Promise<void>((resolve, reject) => {
    let stderr = ""
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`Preview server did not start in time: ${stderr}`))
    }, 5_000)
    const cleanup = (): void => {
      clearTimeout(timeout)
      child.stdout?.off("data", handleStdout)
      child.stderr?.off("data", handleStderr)
      child.off("exit", handleExit)
      child.off("error", handleError)
    }
    const handleStdout = (chunk: Buffer): void => {
      if (!chunk.toString().includes("View HEIC UI preview:")) return
      cleanup()
      resolve()
    }
    const handleStderr = (chunk: Buffer): void => {
      stderr += chunk.toString()
    }
    const handleExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      cleanup()
      reject(new Error(`Preview server exited before listening (${code ?? signal}): ${stderr}`))
    }
    const handleError = (error: Error): void => {
      cleanup()
      reject(error)
    }

    child.stdout?.on("data", handleStdout)
    child.stderr?.on("data", handleStderr)
    child.once("exit", handleExit)
    child.once("error", handleError)
  })

  return { child, origin: `http://127.0.0.1:${port}` }
}

afterEach(async () => {
  await Promise.all(
    [...runningChildren].map(
      (child) =>
        new Promise<void>((resolve) => {
          runningChildren.delete(child)
          if (child.exitCode !== null || child.signalCode !== null) {
            resolve()
            return
          }
          child.once("exit", () => resolve())
          child.kill("SIGTERM")
        })
    )
  )
  await Promise.all(
    [...temporaryDirectories].map(async (directory) => {
      temporaryDirectories.delete(directory)
      await rm(directory, { recursive: true, force: true })
    })
  )
})

describe("review regression contracts", () => {
  it("opens first-install onboarding in English", async () => {
    const links = await import("../../utils/links")

    expect(links.WELCOME_URL).toBe(
      "https://vingeraycn.github.io/view-heic-browser-extension/?welcome=1&lang=en#how-it-works"
    )
    expect(links.getLocalizedHelpUrl("en")).toContain("?lang=en#how-it-works")
    expect(links.getLocalizedFaqUrl("en")).toContain("?lang=en#faq")
  })

  it("uses the unquoted Phosphor family name", async () => {
    const styles = await readRepositoryFile("assets/phosphor-icons.css")

    expect(styles).toContain("font-family: Phosphor;")
    expect(styles).toContain("font-family: Phosphor !important;")
    expect(styles).not.toMatch(/font-family:\s*["']Phosphor["']/)
  })

  it("keeps converter elements with the hidden attribute out of layout", async () => {
    const styles = await readRepositoryFile("entrypoints/converter/style.css")

    expect(styles).toMatch(/\.drop-zone\[hidden\]\s*{\s*display:\s*none;\s*}/)
    expect(styles).toMatch(/\.preview\[hidden\]\s*{\s*display:\s*none;\s*}/)
  })

  it("uses clip-path for the popup's visually hidden content", async () => {
    const styles = await readRepositoryFile("entrypoints/popup/style.css")
    const visuallyHiddenRule = styles.match(/\.visually-hidden\s*{([^}]*)}/)?.[1]

    expect(visuallyHiddenRule).toContain("clip-path: inset(50%);")
    expect(visuallyHiddenRule).not.toMatch(/(^|\s)clip\s*:/)
  })

  it("keeps the analytics switch disabled until its stored preference loads", async () => {
    const popupHtml = await readRepositoryFile("entrypoints/popup/index.html")
    const popupMain = await readRepositoryFile("entrypoints/popup/main.ts")
    const analyticsButton = popupHtml.match(
      /<button[^>]*id="analytics-toggle"[^>]*>/
    )?.[0]

    expect(analyticsButton).toContain('aria-checked="false"')
    expect(analyticsButton).toContain("disabled")
    expect(popupMain).toContain("let analyticsPreferenceLoaded = false")
    expect(popupMain).toContain("analyticsPreferenceLoaded = true")
    expect(popupMain).toContain("void loadAnalyticsPreference()")
    expect(popupMain).toMatch(
      /const\s*\[tab\]\s*=\s*await\s+browser\.tabs\.query\(\s*{\s*active:\s*true,\s*currentWindow:\s*true,?\s*}\s*\)/
    )
    expect(popupMain).not.toMatch(
      /Promise\.all\(\[\s*browser\.tabs\.query[\s\S]*?getAnalyticsEnabled\(\)/
    )
    expect(popupMain).toMatch(
      /if\s*\(\s*!analyticsPreferenceLoaded\s*\|\|\s*analyticsTogglePending\s*\)\s*return/
    )
    expect(popupMain).toMatch(
      /analyticsToggle\.disabled\s*=\s*!analyticsPreferenceLoaded\s*\|\|\s*analyticsTogglePending/
    )
  })

  it("clears converter work before choosing the next site-enabled state", async () => {
    const contentScript = await readRepositoryFile("entrypoints/content.ts")

    expect(contentScript).toMatch(
      /pageConversionController\.abort\(\)\s+pageConversionLedger\.reset\(\)\s+converter\.cancelPendingConversions\(\)\s+if \(enabled\)/
    )
  })

  it("does not restart conversion when a failed image keeps the same source", async () => {
    const converter = await readRepositoryFile("utils/heic-converter.ts")
    const contentScript = await readRepositoryFile("entrypoints/content.ts")

    const errorHandler = converter.match(
      /private handleConversionError\([\s\S]*?\n  }\n}/
    )?.[0]
    expect(errorHandler).toBeDefined()
    expect(errorHandler).not.toContain("img.src = originalSrc")
    expect(contentScript).toContain('if (mutation.oldValue === img.getAttribute("src")) continue')
    expect(contentScript).toContain("if (converter.isCurrentConversionResult(img)) continue")
    expect(contentScript).toMatch(
      /converter\.resetImageProcessed\(img\)\s+if \(isHEICImageCandidate\(img\)\)/
    )
    expect(contentScript).toMatch(
      /attributeFilter: \["src"\],\s+attributeOldValue: true,/
    )
    expect(contentScript).toContain("!pageConversionLedger.hasFailed")
    expect(contentScript.match(/pageConversionLedger\.hasFailed/g)).toHaveLength(3)
    expect(contentScript).toContain("isCurrentPageConversionResult")
    expect(contentScript).toContain("pageConversionLedger.discard(discardedEntries)")
    expect(converter).toContain("cancelled: true")
  })

  it("settles the demo in a stable failure state without polling", async () => {
    const demo = await readRepositoryFile("docs/index.html")

    expect(demo).toContain("const completedFailures = new Set()")
    expect(demo).toContain("completedFailures.add(img)")
    expect(demo).toContain("mutation.attributeName === 'data-heic-failed'")
    expect(demo).toContain("img.dataset.demoState = 'failed'")
    expect(demo).not.toContain("setInterval(updateStats")
  })
})

describe("preview reference image", () => {
  it("rejects a directory without terminating the preview server", async () => {
    const directory = await mkdtemp(join(tmpdir(), "view-heic-reference-directory-"))
    temporaryDirectories.add(directory)
    const { child, origin } = await startPreviewServer(directory)

    const response = await fetch(`${origin}/reference.png`)

    expect(response.status).toBe(404)
    expect(await response.text()).toContain("Set VIEW_HEIC_REFERENCE_IMAGE")
    expect(child.exitCode).toBeNull()
  })

  it.runIf(process.platform !== "win32" && process.getuid?.() !== 0)(
    "handles an error emitted while opening a regular reference file",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "view-heic-reference-error-"))
      temporaryDirectories.add(directory)
      const referencePath = join(directory, "reference.png")
      await writeFile(referencePath, "not-readable")
      await chmod(referencePath, 0o000)
      const { child, origin } = await startPreviewServer(referencePath)

      const response = await fetch(`${origin}/reference.png`)

      expect(response.status).toBe(404)
      expect(await response.text()).toBe("Reference image is unavailable.")
      expect(child.exitCode).toBeNull()
      await chmod(referencePath, 0o600)
    }
  )
})
