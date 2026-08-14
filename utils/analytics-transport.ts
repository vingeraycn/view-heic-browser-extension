import {
  ANALYTICS_ACTIVE_DATE_STORAGE_KEY,
  ANALYTICS_CLIENT_ID_STORAGE_KEY,
  ANALYTICS_ENABLED_STORAGE_KEY,
  ANALYTICS_SCHEMA_VERSION,
  ANALYTICS_SESSION_STORAGE_KEY,
  getAnalyticsEnabled,
  type AnalyticsEventName,
  type AnalyticsParams,
} from "./analytics"

const SESSION_TIMEOUT_MS = 30 * 60 * 1000
const ACTIVE_EVENT_ENGAGEMENT_TIME_MS = 1
const REQUEST_TIMEOUT_MS = 5_000
const MAX_EVENT_QUEUE_AGE_MS = 5 * 60 * 1000

let consentGeneration = 0
let activeRequestController: AbortController | undefined

interface AnalyticsSession {
  id: number
  lastSeenAt: number
}

interface MeasurementEvent {
  name: AnalyticsEventName | "extension_active"
  params: AnalyticsParams
}

export async function sendAnalyticsEvent(
  name: AnalyticsEventName,
  params: AnalyticsParams = {},
  occurredAt = Date.now()
): Promise<boolean> {
  if (import.meta.env.WXT_ENABLE_EXTENSION_ANALYTICS !== "true") return false
  const deliveryStartedAt = Date.now()
  if (
    !Number.isSafeInteger(occurredAt) ||
    occurredAt > deliveryStartedAt ||
    deliveryStartedAt - occurredAt > MAX_EVENT_QUEUE_AGE_MS
  ) {
    return false
  }
  const deliveryGeneration = consentGeneration
  if (!(await isAnalyticsDeliveryAllowed(deliveryGeneration))) return false

  const endpoint = import.meta.env.WXT_ANALYTICS_ENDPOINT
  if (!endpoint) return false

  const stored = await browser.storage.local.get([
    ANALYTICS_CLIENT_ID_STORAGE_KEY,
    ANALYTICS_SESSION_STORAGE_KEY,
    ANALYTICS_ACTIVE_DATE_STORAGE_KEY,
  ])
  if (!(await isAnalyticsDeliveryAllowed(deliveryGeneration))) return false

  const clientId = getClientId(stored[ANALYTICS_CLIENT_ID_STORAGE_KEY], occurredAt)
  const session = getSession(stored[ANALYTICS_SESSION_STORAGE_KEY], occurredAt)
  const activeDate = getActiveDate(stored[ANALYTICS_ACTIVE_DATE_STORAGE_KEY])
  await browser.storage.local.set({
    [ANALYTICS_CLIENT_ID_STORAGE_KEY]: clientId,
    [ANALYTICS_SESSION_STORAGE_KEY]: session,
  })
  if (!(await isAnalyticsDeliveryAllowed(deliveryGeneration))) {
    await clearAnalyticsState()
    return false
  }

  const currentDate = getLocalDateKey(occurredAt)
  const extensionVersion = browser.runtime.getManifest().version
  const commonParams: AnalyticsParams = {
    extension_version: extensionVersion,
    analytics_schema_version: ANALYTICS_SCHEMA_VERSION,
    session_id: session.id,
  }
  const events: MeasurementEvent[] = [
    {
      name,
      params: {
        ...params,
        ...commonParams,
      },
    },
  ]

  const shouldAttachDailyActivity =
    activeDate !== currentDate && isUserDrivenActivity(name)
  if (shouldAttachDailyActivity) {
    events.push({
      name: "extension_active",
      params: {
        ...commonParams,
        activity_source: getActivitySource(name),
        engagement_time_msec: ACTIVE_EVENT_ENGAGEMENT_TIME_MS,
      },
    })
  }

  const requestController = new AbortController()
  activeRequestController = requestController
  const timeout = setTimeout(() => requestController.abort(), REQUEST_TIMEOUT_MS)

  try {
    if (!(await isAnalyticsDeliveryAllowed(deliveryGeneration))) return false
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: requestController.signal,
      body: JSON.stringify({
        client_id: clientId,
        timestamp_micros: occurredAt * 1000,
        events,
      }),
    })

    if (
      response.ok &&
      shouldAttachDailyActivity &&
      (await isAnalyticsDeliveryAllowed(deliveryGeneration))
    ) {
      await browser.storage.local.set({ [ANALYTICS_ACTIVE_DATE_STORAGE_KEY]: currentDate })
      if (!(await isAnalyticsDeliveryAllowed(deliveryGeneration))) {
        await clearAnalyticsState()
        return false
      }
    }
    return response.ok
  } catch (error) {
    if (!requestController.signal.aborted) {
      console.warn("View HEIC analytics event failed:", error)
    }
    return false
  } finally {
    clearTimeout(timeout)
    if (activeRequestController === requestController) activeRequestController = undefined
  }
}

export async function updateAnalyticsPreference(enabled: boolean): Promise<boolean> {
  consentGeneration += 1
  activeRequestController?.abort()

  if (enabled) {
    if (!(await getAnalyticsEnabled())) {
      await clearAnalyticsState()
    }
    await browser.storage.local.set({ [ANALYTICS_ENABLED_STORAGE_KEY]: true })
    return true
  }

  await browser.storage.local.set({ [ANALYTICS_ENABLED_STORAGE_KEY]: false })
  await clearAnalyticsState()
  return true
}

async function clearAnalyticsState(): Promise<void> {
  await browser.storage.local.remove([
    ANALYTICS_CLIENT_ID_STORAGE_KEY,
    ANALYTICS_SESSION_STORAGE_KEY,
    ANALYTICS_ACTIVE_DATE_STORAGE_KEY,
  ])
}

export function createGoogleAnalyticsClientId(now: number): string {
  const random = crypto.getRandomValues(new Uint32Array(1))[0] || 1
  return `${random}.${Math.floor(now / 1000)}`
}

export function isGoogleAnalyticsClientId(value: unknown): value is string {
  return typeof value === "string" && /^\d+\.\d+$/.test(value)
}

function getClientId(stored: unknown, now: number): string {
  return isGoogleAnalyticsClientId(stored) ? stored : createGoogleAnalyticsClientId(now)
}

function getSession(stored: unknown, now: number): AnalyticsSession {
  const session = stored as AnalyticsSession | undefined
  if (isAnalyticsSession(session) && now - session.lastSeenAt < SESSION_TIMEOUT_MS) {
    return { ...session, lastSeenAt: now }
  }
  return { id: Math.floor(now / 1000), lastSeenAt: now }
}

function getActiveDate(stored: unknown): string | undefined {
  return typeof stored === "string" ? stored : undefined
}

function getLocalDateKey(now: number): string {
  const date = new Date(now)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getActivitySource(name: AnalyticsEventName): string {
  if (name === "conversion_completed") return "conversion"
  if (name === "popup_opened" || name === "site_preference_changed") return "popup"
  if (name === "file_converter_opened" || name === "file_downloaded") return "file_converter"
  if (name === "help_opened") return "help"
  return "review_prompt"
}

function isUserDrivenActivity(name: AnalyticsEventName): boolean {
  return name !== "extension_installed" && name !== "extension_updated"
}

async function isAnalyticsDeliveryAllowed(generation: number): Promise<boolean> {
  if (generation !== consentGeneration) return false
  const enabled = await getAnalyticsEnabled()
  return enabled && generation === consentGeneration
}

function isAnalyticsSession(value: unknown): value is AnalyticsSession {
  if (typeof value !== "object" || value === null) return false
  const session = value as Partial<AnalyticsSession>
  return (
    typeof session.id === "number" &&
    Number.isInteger(session.id) &&
    session.id >= 1_000_000_000 &&
    session.id <= 9_999_999_999 &&
    typeof session.lastSeenAt === "number" &&
    Number.isFinite(session.lastSeenAt)
  )
}
