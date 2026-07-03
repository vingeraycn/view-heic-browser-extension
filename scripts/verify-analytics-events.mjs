import { readFileSync } from "node:fs"

const analytics = readFileSync("utils/analytics.ts", "utf8")
const background = readFileSync("entrypoints/background.ts", "utf8")
const content = readFileSync("entrypoints/content.ts", "utf8")
const config = readFileSync("wxt.config.ts", "utf8")
const readme = readFileSync("README.md", "utf8")
const readmeZh = readFileSync("README.zh-CN.md", "utf8")

const eventNames = [
  "heic_detected",
  "conversion_success",
  "conversion_failed",
  "review_prompt_shown",
  "review_prompt_clicked",
  "review_prompt_dismissed",
  "feedback_clicked",
]

const analyticsCallBlocks = content.match(/sendAnalyticsEvent\([\s\S]*?\n\s*\)/g) ?? []
const forbiddenParamPatterns = [/\bpage_url\s*:/, /\burl\s*:/, /\bimage_url\s*:/, /\bfile_name\s*:/, /\bfilename\s*:/, /\bsrc\s*:/]

const checks = [
  {
    name: "GA events are declared in one contract",
    pass: eventNames.every((event) => analytics.includes(`"${event}"`)),
  },
  {
    name: "background service worker sends analytics events",
    pass:
      background.includes('type: "analytics:event"') &&
      background.includes("sendAnalyticsEvent(message.name, message.params)"),
  },
  {
    name: "content script records conversion and review funnel events",
    pass: eventNames.every((event) => content.includes(`"${event}"`)),
  },
  {
    name: "event payload avoids URLs and file names",
    pass: analyticsCallBlocks.every((block) => forbiddenParamPatterns.every((pattern) => !pattern.test(block))),
  },
  {
    name: "GA host permission is gated by WXT env",
    pass:
      config.includes("manifest: () =>") &&
      config.includes("WXT_ENABLE_EXTENSION_ANALYTICS") &&
      config.includes("https://www.google-analytics.com/*"),
  },
  {
    name: "privacy copy says analytics is anonymous and excludes image/page data",
    pass:
      readme.includes("anonymous product events") &&
      readme.includes("does not upload image contents, image URLs, page URLs, file names") &&
      readmeZh.includes("匿名产品事件") &&
      readmeZh.includes("不会上传图片内容、图片地址、页面地址、文件名"),
  },
]

const failed = checks.filter((check) => !check.pass)

for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}`)
}

if (failed.length > 0) {
  process.exit(1)
}
