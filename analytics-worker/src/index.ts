interface AnalyticsWorkerEnv {
  ALLOWED_EXTENSION_ORIGIN: string
  ANALYTICS_RATE_LIMITER: AnalyticsRateLimiter
  GA_API_SECRET: string
  GA_MEASUREMENT_ID: string
}

interface AnalyticsRateLimiter {
  limit: (options: { key: string }) => Promise<{ success: boolean }>
}

interface AnalyticsEvent {
  name: string
  params: Record<string, unknown>
}

interface AnalyticsPayload {
  client_id: string
  timestamp_micros: number
  events: AnalyticsEvent[]
}

const MAX_BODY_BYTES = 16_384
const MAX_DURATION_MS = 86_400_000
const MAX_EVENT_AGE_MICROS = 5 * 60 * 1_000_000
const MAX_FUTURE_SKEW_MICROS = 10 * 1_000_000
const COMMON_PARAMS = new Set([
  "analytics_schema_version",
  "extension_version",
  "session_id",
])

const EVENT_PARAMS: Record<string, ReadonlySet<string>> = {
  extension_installed: new Set(),
  extension_updated: new Set(["previous_version"]),
  popup_opened: new Set(["connection_state", "page_phase", "site_enabled"]),
  site_preference_changed: new Set(["enabled"]),
  help_opened: new Set(["surface"]),
  file_converter_opened: new Set(),
  conversion_completed: new Set([
    "surface",
    "trigger",
    "outcome",
    "attempted_count",
    "success_count",
    "failure_count",
    "duration_ms",
    "error_type",
  ]),
  file_downloaded: new Set(),
  review_prompt_shown: new Set(["success_total"]),
  review_prompt_action: new Set(["action", "success_total", "failure_total"]),
  extension_active: new Set(["activity_source", "engagement_time_msec"]),
}

const ALLOWED_VALUES_BY_EVENT: Record<string, Record<string, ReadonlySet<string>>> = {
  popup_opened: {
    connection_state: new Set(["connected", "disconnected"]),
    page_phase: new Set([
      "initializing",
      "converting",
      "complete",
      "error",
      "idle",
      "disabled",
      "unavailable",
    ]),
  },
  help_opened: {
    surface: new Set(["popup", "file_converter"]),
  },
  conversion_completed: {
    surface: new Set(["page_image", "web_upload", "file_converter"]),
    trigger: new Set(["initial", "mutation", "file_picker", "drop", "paste"]),
    outcome: new Set(["success", "partial", "failure"]),
    error_type: new Set([
      "network",
      "cors",
      "size",
      "format",
      "conversion",
      "mixed",
      "replay",
      "unknown",
    ]),
  },
  review_prompt_action: {
    action: new Set(["review", "feedback", "dismissed"]),
  },
  extension_active: {
    activity_source: new Set([
      "conversion",
      "popup",
      "file_converter",
      "help",
      "review_prompt",
    ]),
  },
}

const CONVERSION_TRIGGERS_BY_SURFACE: Record<string, ReadonlySet<string>> = {
  page_image: new Set(["initial", "mutation"]),
  web_upload: new Set(["file_picker", "drop", "paste"]),
  file_converter: new Set(["file_picker", "drop"]),
}

const REQUIRED_EVENT_PARAMS: Record<string, readonly string[]> = {
  extension_installed: [],
  extension_updated: [],
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
  ],
  file_downloaded: [],
  review_prompt_shown: ["success_total"],
  review_prompt_action: ["action", "success_total", "failure_total"],
  extension_active: ["activity_source", "engagement_time_msec"],
}

const ACTIVITY_SOURCE_BY_EVENT: Record<string, string> = {
  popup_opened: "popup",
  site_preference_changed: "popup",
  help_opened: "help",
  file_converter_opened: "file_converter",
  conversion_completed: "conversion",
  file_downloaded: "file_converter",
  review_prompt_shown: "review_prompt",
  review_prompt_action: "review_prompt",
}

export async function handleAnalyticsRequest(
  request: Request,
  env: AnalyticsWorkerEnv,
  forward: typeof fetch = fetch
): Promise<Response> {
  const responseHeaders = getResponseHeaders(env.ALLOWED_EXTENSION_ORIGIN)
  const origin = request.headers.get("Origin")

  if (origin !== env.ALLOWED_EXTENSION_ORIGIN) {
    return new Response("Forbidden", { status: 403, headers: responseHeaders })
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders })
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: responseHeaders })
  }

  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return new Response("Unsupported media type", { status: 415, headers: responseHeaders })
  }

  const clientAddress = request.headers.get("CF-Connecting-IP")
  if (!clientAddress) {
    return new Response("Forbidden", { status: 403, headers: responseHeaders })
  }

  try {
    const { success } = await env.ANALYTICS_RATE_LIMITER.limit({ key: clientAddress })
    if (!success) {
      return new Response("Too many requests", { status: 429, headers: responseHeaders })
    }
  } catch {
    return new Response(null, { status: 503, headers: responseHeaders })
  }

  const declaredLength = Number(request.headers.get("Content-Length") ?? 0)
  if (declaredLength > MAX_BODY_BYTES) {
    return new Response("Payload too large", { status: 413, headers: responseHeaders })
  }

  const body = await readBoundedBody(request.body, MAX_BODY_BYTES)
  if (body === undefined) {
    return new Response("Payload too large", { status: 413, headers: responseHeaders })
  }

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: responseHeaders })
  }

  if (!isAnalyticsPayload(payload)) {
    return new Response("Invalid analytics payload", {
      status: 400,
      headers: responseHeaders,
    })
  }

  const endpoint = new URL("https://www.google-analytics.com/mp/collect")
  endpoint.searchParams.set("measurement_id", env.GA_MEASUREMENT_ID)
  endpoint.searchParams.set("api_secret", env.GA_API_SECRET)

  let upstream: Response
  try {
    upstream = await forward(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch {
    return new Response(null, { status: 502, headers: responseHeaders })
  }

  return new Response(null, {
    status: upstream.ok ? 204 : 502,
    headers: responseHeaders,
  })
}

function isAnalyticsPayload(value: unknown): value is AnalyticsPayload {
  if (!isRecord(value)) return false
  if (!hasOnlyKeys(value, ["client_id", "timestamp_micros", "events"])) return false
  if (typeof value.client_id !== "string" || !/^\d+\.\d+$/.test(value.client_id)) {
    return false
  }
  if (!isRecentEventTimestamp(value.timestamp_micros)) return false
  if (!Array.isArray(value.events) || value.events.length < 1 || value.events.length > 2) {
    return false
  }

  if (!value.events.every(isAnalyticsEvent)) return false
  return isValidAnalyticsBatch(value.events)
}

function isRecentEventTimestamp(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return false
  const nowMicros = Date.now() * 1000
  return (
    value >= nowMicros - MAX_EVENT_AGE_MICROS &&
    value <= nowMicros + MAX_FUTURE_SKEW_MICROS
  )
}

function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  if (!isRecord(value) || !hasOnlyKeys(value, ["name", "params"])) return false
  if (
    typeof value.name !== "string" ||
    !Object.prototype.hasOwnProperty.call(EVENT_PARAMS, value.name)
  ) {
    return false
  }
  const eventName = value.name
  if (!isRecord(value.params)) return false
  const params = value.params

  const allowed = new Set([...COMMON_PARAMS, ...EVENT_PARAMS[value.name]])
  if (!Object.keys(params).every((key) => allowed.has(key))) return false
  for (const key of COMMON_PARAMS) {
    if (!(key in params)) return false
  }
  if (!REQUIRED_EVENT_PARAMS[value.name].every((key) => key in params)) return false

  if (!Object.entries(params).every(([key, param]) => isValidParam(eventName, key, param))) {
    return false
  }
  return value.name !== "conversion_completed" || isValidConversionResult(params)
}

function isValidParam(eventName: string, key: string, value: unknown): boolean {
  if (key === "analytics_schema_version") return value === "2"
  if (key === "extension_version" || key === "previous_version") {
    return typeof value === "string" && /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(value)
  }
  if (key === "session_id") return isBoundedInteger(value, 1, Number.MAX_SAFE_INTEGER)
  if (key === "site_enabled" || key === "enabled") return typeof value === "boolean"
  if (
    key === "attempted_count" ||
    key === "success_count" ||
    key === "failure_count"
  ) {
    return isBoundedInteger(value, 0, 10_000)
  }
  if (key === "success_total" || key === "failure_total") {
    return isBoundedInteger(value, 0, 1_000_000_000)
  }
  if (key === "duration_ms") return isBoundedInteger(value, 0, MAX_DURATION_MS)
  if (key === "engagement_time_msec") return value === 1
  const allowedValues = ALLOWED_VALUES_BY_EVENT[eventName]?.[key]
  if (allowedValues) {
    return typeof value === "string" && allowedValues.has(value)
  }
  return false
}

function isValidConversionResult(params: Record<string, unknown>): boolean {
  const attemptedCount = params.attempted_count
  const successCount = params.success_count
  const failureCount = params.failure_count
  const outcome = params.outcome
  if (
    typeof attemptedCount !== "number" ||
    typeof successCount !== "number" ||
    typeof failureCount !== "number" ||
    attemptedCount < 1 ||
    successCount + failureCount !== attemptedCount
  ) {
    return false
  }
  if (
    typeof params.surface !== "string" ||
    typeof params.trigger !== "string" ||
    !CONVERSION_TRIGGERS_BY_SURFACE[params.surface]?.has(params.trigger)
  ) {
    return false
  }
  if (outcome === "success") return successCount > 0 && failureCount === 0
  if (outcome === "partial") return successCount > 0 && failureCount > 0
  return outcome === "failure" && successCount === 0 && failureCount > 0
}

function isValidAnalyticsBatch(events: AnalyticsEvent[]): boolean {
  const [primaryEvent, activeEvent] = events
  if (primaryEvent.name === "extension_active") return false
  if (!activeEvent) return true
  if (activeEvent.name !== "extension_active") return false

  const expectedSource = ACTIVITY_SOURCE_BY_EVENT[primaryEvent.name]
  return (
    activeEvent.params.activity_source === expectedSource &&
    activeEvent.params.analytics_schema_version ===
      primaryEvent.params.analytics_schema_version &&
    activeEvent.params.extension_version === primaryEvent.params.extension_version &&
    activeEvent.params.session_id === primaryEvent.params.session_id
  )
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number
): Promise<string | undefined> {
  if (!body) return ""

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel()
        return undefined
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function isBoundedInteger(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
}

function getResponseHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    Vary: "Origin",
  }
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed)
  return Object.keys(value).every((key) => allowedKeys.has(key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export default {
  fetch(request: Request, env: AnalyticsWorkerEnv): Promise<Response> {
    return handleAnalyticsRequest(request, env)
  },
}
