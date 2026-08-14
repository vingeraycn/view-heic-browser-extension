export const ANALYTICS_SCHEMA_VERSION = "2"
export const ANALYTICS_MAX_DURATION_MS = 24 * 60 * 60 * 1000
export const ANALYTICS_MESSAGE_TYPE = "analytics:event"
export const ANALYTICS_PREFERENCE_MESSAGE_TYPE = "analytics:preference"
export const ANALYTICS_ENABLED_STORAGE_KEY = "viewHeicAnalyticsEnabled"
export const ANALYTICS_CLIENT_ID_STORAGE_KEY = "viewHeicAnalyticsClientId"
export const ANALYTICS_SESSION_STORAGE_KEY = "viewHeicAnalyticsSession"
export const ANALYTICS_ACTIVE_DATE_STORAGE_KEY = "viewHeicAnalyticsActiveDate"

export type AnalyticsErrorType =
  | "network"
  | "cors"
  | "size"
  | "format"
  | "conversion"
  | "mixed"
  | "replay"
  | "unknown"

export type ConversionSurface = "page_image" | "web_upload" | "file_converter"
export type ConversionTrigger =
  | "initial"
  | "mutation"
  | "file_picker"
  | "drop"
  | "paste"
export type ConversionOutcome = "success" | "partial" | "failure"

export interface AnalyticsEventParamsByName {
  extension_installed: Record<string, never>
  extension_updated: {
    previous_version?: string
  }
  popup_opened: {
    connection_state: "connected" | "disconnected"
    page_phase: string
    site_enabled: boolean
  }
  site_preference_changed: {
    enabled: boolean
  }
  help_opened: {
    surface: "popup" | "file_converter"
  }
  file_converter_opened: Record<string, never>
  conversion_completed: {
    surface: ConversionSurface
    trigger: ConversionTrigger
    outcome: ConversionOutcome
    attempted_count: number
    success_count: number
    failure_count: number
    duration_ms: number
    error_type?: AnalyticsErrorType
  }
  file_downloaded: Record<string, never>
  review_prompt_shown: {
    success_total: number
  }
  review_prompt_action: {
    action: "review" | "feedback" | "dismissed"
    success_total: number
    failure_total: number
  }
}

export type AnalyticsEventName = keyof AnalyticsEventParamsByName
export type AnalyticsParams = Record<string, string | number | boolean | undefined>

export interface AnalyticsEventMessage {
  type: typeof ANALYTICS_MESSAGE_TYPE
  name: AnalyticsEventName
  params: AnalyticsParams
}

export interface AnalyticsPreferenceMessage {
  type: typeof ANALYTICS_PREFERENCE_MESSAGE_TYPE
  enabled: boolean
}

const EVENT_PARAM_ALLOWLIST: Record<AnalyticsEventName, readonly string[]> = {
  extension_installed: [],
  extension_updated: ["previous_version"],
  popup_opened: ["connection_state", "page_phase", "site_enabled"],
  site_preference_changed: ["enabled"],
  help_opened: ["surface"],
  file_converter_opened: [],
  conversion_completed: [
    "surface",
    "trigger",
    "outcome",
    "attempted_count",
    "success_count",
    "failure_count",
    "duration_ms",
    "error_type",
  ],
  file_downloaded: [],
  review_prompt_shown: ["success_total"],
  review_prompt_action: ["action", "success_total", "failure_total"],
}

export async function trackAnalyticsEvent<Name extends AnalyticsEventName>(
  name: Name,
  params: AnalyticsEventParamsByName[Name]
): Promise<boolean> {
  try {
    return Boolean(
      await browser.runtime.sendMessage({
        type: ANALYTICS_MESSAGE_TYPE,
        name,
        params,
      } satisfies AnalyticsEventMessage)
    )
  } catch (error) {
    console.warn("View HEIC analytics message failed:", error)
    return false
  }
}

export async function getAnalyticsEnabled(): Promise<boolean> {
  const stored = await browser.storage.local.get(ANALYTICS_ENABLED_STORAGE_KEY)
  return stored[ANALYTICS_ENABLED_STORAGE_KEY] !== false
}

export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
  const updated = await browser.runtime.sendMessage({
    type: ANALYTICS_PREFERENCE_MESSAGE_TYPE,
    enabled,
  } satisfies AnalyticsPreferenceMessage)
  if (updated !== true) throw new Error("Analytics preference was not updated")
}

export function getConversionOutcome(
  successCount: number,
  failureCount: number
): ConversionOutcome {
  if (successCount > 0 && failureCount > 0) return "partial"
  if (successCount > 0) return "success"
  return "failure"
}

export function getAnalyticsDurationMs(elapsedMs: number): number {
  return Math.min(ANALYTICS_MAX_DURATION_MS, Math.max(0, Math.round(elapsedMs)))
}

export function isAnalyticsMessage(message: unknown): message is AnalyticsEventMessage {
  if (!isRecord(message) || message.type !== ANALYTICS_MESSAGE_TYPE) return false
  if (typeof message.name !== "string" || !isAnalyticsEventName(message.name)) return false
  if (!isRecord(message.params)) return false

  const allowedParams = new Set(EVENT_PARAM_ALLOWLIST[message.name])
  return Object.entries(message.params).every(
    ([key, value]) => allowedParams.has(key) && isAnalyticsParamValue(value)
  )
}

export function isAnalyticsPreferenceMessage(
  message: unknown
): message is AnalyticsPreferenceMessage {
  return (
    isRecord(message) &&
    message.type === ANALYTICS_PREFERENCE_MESSAGE_TYPE &&
    typeof message.enabled === "boolean"
  )
}

function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return Object.prototype.hasOwnProperty.call(EVENT_PARAM_ALLOWLIST, value)
}

function isAnalyticsParamValue(value: unknown): value is string | number | boolean | undefined {
  return (
    value === undefined ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
