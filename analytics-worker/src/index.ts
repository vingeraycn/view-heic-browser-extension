interface AnalyticsWorkerEnv {
  ALLOWED_EXTENSION_ORIGIN: string
  GA_API_SECRET: string
  GA_MEASUREMENT_ID: string
}

interface AnalyticsEvent {
  name: string
  params: Record<string, unknown>
}

interface AnalyticsPayload {
  client_id: string
  events: AnalyticsEvent[]
}

const MAX_BODY_BYTES = 16_384
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

const ALLOWED_VALUES: Record<string, ReadonlySet<string>> = {
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
  surface: new Set(["page_image", "web_upload", "file_converter", "popup"]),
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
  action: new Set(["review", "feedback", "dismissed"]),
  activity_source: new Set([
    "extension_installed",
    "extension_updated",
    "conversion",
    "popup",
    "file_converter",
    "help",
    "review_prompt",
  ]),
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

  const declaredLength = Number(request.headers.get("Content-Length") ?? 0)
  if (declaredLength > MAX_BODY_BYTES) {
    return new Response("Payload too large", { status: 413, headers: responseHeaders })
  }

  const body = await request.text()
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
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
  if (!hasOnlyKeys(value, ["client_id", "events"])) return false
  if (typeof value.client_id !== "string" || !/^\d+\.\d+$/.test(value.client_id)) {
    return false
  }
  if (!Array.isArray(value.events) || value.events.length < 1 || value.events.length > 2) {
    return false
  }

  return value.events.every(isAnalyticsEvent)
}

function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  if (!isRecord(value) || !hasOnlyKeys(value, ["name", "params"])) return false
  if (typeof value.name !== "string" || !(value.name in EVENT_PARAMS)) return false
  if (!isRecord(value.params)) return false
  const params = value.params

  const allowed = new Set([...COMMON_PARAMS, ...EVENT_PARAMS[value.name]])
  if (!Object.keys(params).every((key) => allowed.has(key))) return false
  for (const key of COMMON_PARAMS) {
    if (!(key in params)) return false
  }
  if (!REQUIRED_EVENT_PARAMS[value.name].every((key) => key in params)) return false

  return Object.entries(params).every(([key, param]) => isValidParam(key, param))
}

function isValidParam(key: string, value: unknown): boolean {
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
  if (key === "duration_ms") return isBoundedInteger(value, 0, 600_000)
  if (key === "engagement_time_msec") return value === 1
  if (ALLOWED_VALUES[key]) {
    return typeof value === "string" && ALLOWED_VALUES[key].has(value)
  }
  return false
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
