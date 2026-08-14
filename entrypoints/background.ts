import { isAnalyticsMessage, isAnalyticsPreferenceMessage } from "../utils/analytics"
import {
  sendAnalyticsEvent,
  updateAnalyticsPreference,
} from "../utils/analytics-transport"
import { WELCOME_URL } from "../utils/links"

let analyticsQueue: Promise<boolean> = Promise.resolve(true)

export default defineBackground(() => {
  console.log("🚀 View HEIC Extension Background Loaded")

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      console.log("🎉 View HEIC Extension 安装成功！")
      void enqueueAnalyticsEvent("extension_installed", {})
      browser.tabs.create({ url: WELCOME_URL })
    } else if (details.reason === "update") {
      console.log("🔄 View HEIC Extension 已更新到新版本")
      void enqueueAnalyticsEvent(
        "extension_updated",
        details.previousVersion ? { previous_version: details.previousVersion } : {}
      )
    }
  })

  browser.runtime.onMessage.addListener((message) => {
    if (isAnalyticsPreferenceMessage(message)) {
      return updateAnalyticsPreference(message.enabled)
    }
    if (!isAnalyticsMessage(message)) return
    return enqueueAnalyticsEvent(message.name, message.params)
  })
})

function enqueueAnalyticsEvent(
  name: Parameters<typeof sendAnalyticsEvent>[0],
  params: Parameters<typeof sendAnalyticsEvent>[1]
): Promise<boolean> {
  analyticsQueue = analyticsQueue.then(
    () => sendAnalyticsEvent(name, params),
    () => sendAnalyticsEvent(name, params)
  )
  return analyticsQueue
}
