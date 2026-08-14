import {
  ANALYTICS_ACTIVE_DATE_STORAGE_KEY,
  ANALYTICS_CLIENT_ID_STORAGE_KEY,
  ANALYTICS_SCHEMA_VERSION,
  ANALYTICS_SESSION_STORAGE_KEY,
  getAnalyticsEnabled,
  type AnalyticsEventName,
  type AnalyticsParams,
} from "./analytics"

const SESSION_TIMEOUT_MS = 30 * 60 * 1000
const ACTIVE_EVENT_ENGAGEMENT_TIME_MS = 1

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
  params: AnalyticsParams = {}
): Promise<boolean> {
  if (import.meta.env.WXT_ENABLE_EXTENSION_ANALYTICS !== "true") return false
  if (!(await getAnalyticsEnabled())) return false

  const endpoint = import.meta.env.WXT_ANALYTICS_ENDPOINT
  if (!endpoint) return false

  const now = Date.now()
  const [clientId, sessionId, activeDate] = await Promise.all([
    getOrCreateClientId(now),
    getOrCreateSessionId(now),
    getStoredActiveDate(),
  ])
  const currentDate = getLocalDateKey(now)
  const extensionVersion = browser.runtime.getManifest().version
  const commonParams: AnalyticsParams = {
    extension_version: extensionVersion,
    analytics_schema_version: ANALYTICS_SCHEMA_VERSION,
    session_id: sessionId,
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

  if (activeDate !== currentDate) {
    events.push({
      name: "extension_active",
      params: {
        ...commonParams,
        activity_source: getActivitySource(name),
        engagement_time_msec: ACTIVE_EVENT_ENGAGEMENT_TIME_MS,
      },
    })
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ client_id: clientId, events }),
    })

    if (response.ok && activeDate !== currentDate) {
      await browser.storage.local.set({ [ANALYTICS_ACTIVE_DATE_STORAGE_KEY]: currentDate })
    }
    return response.ok
  } catch (error) {
    console.warn("View HEIC analytics event failed:", error)
    return false
  }
}

export function createGoogleAnalyticsClientId(now: number): string {
  const random = crypto.getRandomValues(new Uint32Array(1))[0] || 1
  return `${random}.${Math.floor(now / 1000)}`
}

export function isGoogleAnalyticsClientId(value: unknown): value is string {
  return typeof value === "string" && /^\d+\.\d+$/.test(value)
}

async function getOrCreateClientId(now: number): Promise<string> {
  const stored = await browser.storage.local.get(ANALYTICS_CLIENT_ID_STORAGE_KEY)
  const existingClientId = stored[ANALYTICS_CLIENT_ID_STORAGE_KEY]
  if (isGoogleAnalyticsClientId(existingClientId)) return existingClientId

  const clientId = createGoogleAnalyticsClientId(now)
  await browser.storage.local.set({ [ANALYTICS_CLIENT_ID_STORAGE_KEY]: clientId })
  return clientId
}

async function getOrCreateSessionId(now: number): Promise<number> {
  const stored = await browser.storage.local.get(ANALYTICS_SESSION_STORAGE_KEY)
  const session = stored[ANALYTICS_SESSION_STORAGE_KEY] as AnalyticsSession | undefined

  if (isAnalyticsSession(session) && now - session.lastSeenAt < SESSION_TIMEOUT_MS) {
    await browser.storage.local.set({
      [ANALYTICS_SESSION_STORAGE_KEY]: { ...session, lastSeenAt: now },
    })
    return session.id
  }

  const nextSession = { id: Math.floor(now / 1000), lastSeenAt: now }
  await browser.storage.local.set({ [ANALYTICS_SESSION_STORAGE_KEY]: nextSession })
  return nextSession.id
}

async function getStoredActiveDate(): Promise<string | undefined> {
  const stored = await browser.storage.local.get(ANALYTICS_ACTIVE_DATE_STORAGE_KEY)
  const value = stored[ANALYTICS_ACTIVE_DATE_STORAGE_KEY]
  return typeof value === "string" ? value : undefined
}

function getLocalDateKey(now: number): string {
  const date = new Date(now)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getActivitySource(name: AnalyticsEventName): string {
  if (name === "extension_installed" || name === "extension_updated") return name
  if (name === "conversion_completed") return "conversion"
  if (name === "popup_opened" || name === "site_preference_changed") return "popup"
  if (name === "file_converter_opened" || name === "file_downloaded") return "file_converter"
  if (name === "help_opened") return "help"
  return "review_prompt"
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
