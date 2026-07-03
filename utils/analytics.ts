export type AnalyticsEventName =
  | "heic_detected"
  | "conversion_success"
  | "conversion_failed"
  | "review_prompt_shown"
  | "review_prompt_clicked"
  | "review_prompt_dismissed"
  | "feedback_clicked"

export type AnalyticsParams = Record<string, string | number | boolean | undefined>

const GA_ENDPOINT = "https://www.google-analytics.com/mp/collect"
const CLIENT_ID_KEY = "viewHeicAnalyticsClientId"
const SESSION_KEY = "viewHeicAnalyticsSession"
const SESSION_TIMEOUT_MS = 30 * 60 * 1000
const DEFAULT_ENGAGEMENT_TIME_MS = 100
const EVENT_PARAM_ALLOWLIST: Record<AnalyticsEventName, readonly string[]> = {
  heic_detected: ["image_count"],
  conversion_success: ["success_count", "trigger"],
  conversion_failed: ["failure_count", "error_type", "trigger"],
  review_prompt_shown: ["success_total"],
  review_prompt_clicked: ["success_total"],
  review_prompt_dismissed: ["success_total"],
  feedback_clicked: ["failure_total"],
}

interface AnalyticsSession {
  id: number
  lastSeenAt: number
}

export async function sendAnalyticsEvent(
  name: AnalyticsEventName,
  params: AnalyticsParams = {}
): Promise<boolean> {
  const allowedParams = EVENT_PARAM_ALLOWLIST[name]
  if (!allowedParams) return false

  if (import.meta.env.WXT_ENABLE_EXTENSION_ANALYTICS !== "true") return false

  const measurementId = import.meta.env.WXT_GA_MEASUREMENT_ID
  const apiSecret = import.meta.env.WXT_GA_API_SECRET
  if (!measurementId || !apiSecret) return false

  const now = Date.now()
  const [clientId, sessionId] = await Promise.all([getOrCreateClientId(), getOrCreateSessionId(now)])

  try {
    const response = await fetch(
      `${GA_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: "POST",
        keepalive: true,
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          client_id: clientId,
          events: [
            {
              name,
              params: {
                ...sanitizeParams(params, allowedParams),
                session_id: sessionId,
                engagement_time_msec: DEFAULT_ENGAGEMENT_TIME_MS,
              },
            },
          ],
        }),
      }
    )

    return response.ok
  } catch (error) {
    console.warn("View HEIC analytics event failed:", error)
    return false
  }
}

async function getOrCreateClientId(): Promise<string> {
  const stored = await browser.storage.local.get(CLIENT_ID_KEY)
  if (typeof stored[CLIENT_ID_KEY] === "string") return stored[CLIENT_ID_KEY]

  const clientId = crypto.randomUUID()
  await browser.storage.local.set({ [CLIENT_ID_KEY]: clientId })
  return clientId
}

async function getOrCreateSessionId(now: number): Promise<number> {
  const stored = await browser.storage.local.get(SESSION_KEY)
  const session = stored[SESSION_KEY] as AnalyticsSession | undefined

  if (session && now - session.lastSeenAt < SESSION_TIMEOUT_MS) {
    const nextSession = { ...session, lastSeenAt: now }
    await browser.storage.local.set({ [SESSION_KEY]: nextSession })
    return nextSession.id
  }

  const nextSession = { id: now, lastSeenAt: now }
  await browser.storage.local.set({ [SESSION_KEY]: nextSession })
  return nextSession.id
}

function sanitizeParams(params: AnalyticsParams, allowedParams: readonly string[]): AnalyticsParams {
  const allowed = new Set(allowedParams)
  return Object.fromEntries(
    Object.entries(params).filter(([key, value]) => allowed.has(key) && value !== undefined)
  ) as AnalyticsParams
}
