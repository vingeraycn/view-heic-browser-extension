import { sendAnalyticsEvent, type AnalyticsEventName, type AnalyticsParams } from "../utils/analytics"

const OFFICIAL_SITE_URL = "https://vingeraycn.github.io/view-heic-browser-extension/?welcome=1#how-it-works"
const ANALYTICS_EVENT_NAMES = new Set<AnalyticsEventName>([
  "heic_detected",
  "conversion_success",
  "conversion_failed",
  "review_prompt_shown",
  "review_prompt_clicked",
  "review_prompt_dismissed",
  "feedback_clicked",
])

export default defineBackground(() => {
  console.log("🚀 View HEIC Extension Background Loaded")

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      console.log("🎉 View HEIC Extension 安装成功！")
      browser.tabs.create({ url: OFFICIAL_SITE_URL })
    } else if (details.reason === "update") {
      console.log("🔄 View HEIC Extension 已更新到新版本")
    }
  })

  browser.runtime.onMessage.addListener((message) => {
    if (!isAnalyticsMessage(message)) return
    return sendAnalyticsEvent(message.name, message.params)
  })
})

function isAnalyticsMessage(message: unknown): message is {
  type: "analytics:event"
  name: AnalyticsEventName
  params?: AnalyticsParams
} {
  const name = (message as { name?: unknown } | null)?.name
  const params = (message as { params?: unknown } | null)?.params

  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "analytics:event" &&
    typeof name === "string" &&
    ANALYTICS_EVENT_NAMES.has(name as AnalyticsEventName) &&
    isAnalyticsParams(params)
  )
}

function isAnalyticsParams(params: unknown): params is AnalyticsParams | undefined {
  if (params === undefined) return true
  if (typeof params !== "object" || params === null || Array.isArray(params)) return false

  return Object.values(params).every(
    (value) =>
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
  )
}
