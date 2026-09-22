import { isAnalyticsMessage, isAnalyticsPreferenceMessage } from "../utils/analytics"
import {
  sendAnalyticsEvent,
  updateAnalyticsPreference,
} from "../utils/analytics-transport"
import { WELCOME_URL } from "../utils/links"
import { SerialTaskQueue } from "../utils/serial-task-queue"

const analyticsQueue = new SerialTaskQueue()

export default defineBackground(() => {
  console.log("🚀 View HEIC Extension Background Loaded")

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      console.log("🎉 View HEIC Extension installed successfully!")
      void enqueueAnalyticsEvent("extension_installed", {})
      browser.tabs.create({ url: WELCOME_URL })
    } else if (details.reason === "update") {
      console.log("🔄 View HEIC Extension updated to a new version")
      void enqueueAnalyticsEvent(
        "extension_updated",
        details.previousVersion ? { previous_version: details.previousVersion } : {}
      )
    }
  })

  browser.runtime.onMessage.addListener((message) => {
    if (isAnalyticsPreferenceMessage(message)) {
      analyticsQueue.invalidatePending()
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
  const occurredAt = Date.now()
  return analyticsQueue.runIfCurrent(
    () => sendAnalyticsEvent(name, params, occurredAt),
    false
  )
}
