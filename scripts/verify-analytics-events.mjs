import { readFileSync } from "node:fs"

const files = Object.fromEntries(
  [
    ".env.example",
    "analytics-worker/src/index.ts",
    "analytics-worker/wrangler.jsonc",
    "docs/analytics.md",
    "docs/privacy.html",
    "entrypoints/background.ts",
    "entrypoints/content.ts",
    "entrypoints/converter/main.ts",
    "entrypoints/popup/main.ts",
    "utils/analytics-transport.ts",
    "utils/analytics.ts",
    "wxt.config.ts",
  ].map((path) => [path, readFileSync(path, "utf8")])
)

const eventPlacements = {
  extension_installed: ["entrypoints/background.ts"],
  extension_updated: ["entrypoints/background.ts"],
  popup_opened: ["entrypoints/popup/main.ts"],
  site_preference_changed: ["entrypoints/content.ts"],
  help_opened: ["entrypoints/popup/main.ts", "entrypoints/converter/main.ts"],
  file_converter_opened: ["entrypoints/converter/main.ts"],
  conversion_completed: ["entrypoints/content.ts", "entrypoints/converter/main.ts"],
  file_downloaded: ["entrypoints/converter/main.ts"],
  review_prompt_shown: ["entrypoints/content.ts"],
  review_prompt_action: ["entrypoints/content.ts"],
}

const productSources = [
  files["entrypoints/background.ts"],
  files["entrypoints/content.ts"],
  files["entrypoints/converter/main.ts"],
  files["entrypoints/popup/main.ts"],
]
const analyticsCallBlocks = productSources.flatMap((source) =>
  findCalls(source, "trackAnalyticsEvent")
)
const forbiddenParamPatterns = [
  /\bpage_url\s*:/,
  /\burl\s*:/,
  /\bhostname\s*:/,
  /\bimage_url\s*:/,
  /\bfile_name\s*:/,
  /\bfilename\s*:/,
  /\bsrc\s*:/,
]

const checks = [
  {
    name: "event names and parameters live in one typed client contract",
    pass:
      files["utils/analytics.ts"].includes("AnalyticsEventParamsByName") &&
      files["utils/analytics.ts"].includes("EVENT_PARAM_ALLOWLIST") &&
      Object.keys(eventPlacements).every((event) =>
        files["utils/analytics.ts"].includes(`${event}:`)
      ),
  },
  {
    name: "all product surfaces emit their declared events",
    pass: Object.entries(eventPlacements).every(([event, paths]) =>
      paths.every((path) => files[path].includes(`"${event}"`))
    ),
  },
  {
    name: "one daily extension_active event is attached by the transport",
    pass:
      files["utils/analytics-transport.ts"].includes('name: "extension_active"') &&
      files["utils/analytics-transport.ts"].includes("ANALYTICS_ACTIVE_DATE_STORAGE_KEY") &&
      files["utils/analytics-transport.ts"].includes("engagement_time_msec") &&
      files["utils/analytics-transport.ts"].includes("timestamp_micros: occurredAt * 1000") &&
      files["entrypoints/background.ts"].includes("const occurredAt = Date.now()") &&
      files["entrypoints/background.ts"].includes("sendAnalyticsEvent(name, params, occurredAt)"),
  },
  {
    name: "event calls do not send URL, hostname, source, or file-name fields",
    pass: analyticsCallBlocks.every((block) =>
      forbiddenParamPatterns.every((pattern) => !pattern.test(block))
    ),
  },
  {
    name: "product behavior never waits for analytics delivery",
    pass: productSources.every((source) => !source.includes("await trackAnalyticsEvent")),
  },
  {
    name: "the extension sends only to a configured first-party endpoint",
    pass:
      files["utils/analytics-transport.ts"].includes("WXT_ANALYTICS_ENDPOINT") &&
      files["wxt.config.ts"].includes("getAnalyticsHostPermissions") &&
      !files["utils/analytics-transport.ts"].includes("google-analytics.com") &&
      !files["wxt.config.ts"].includes("https://www.google-analytics.com"),
  },
  {
    name: "GA credentials are absent from the client configuration",
    pass:
      !files[".env.example"].includes("GA_API_SECRET") &&
      !files[".env.example"].includes("GA_MEASUREMENT_ID") &&
      !files["utils/analytics-transport.ts"].includes("GA_API_SECRET") &&
      !files["utils/analytics-transport.ts"].includes("GA_MEASUREMENT_ID"),
  },
  {
    name: "the edge proxy validates origin, payload size, client ID, events, and params",
    pass: [
      "ALLOWED_EXTENSION_ORIGIN",
      "MAX_BODY_BYTES",
      "ANALYTICS_RATE_LIMITER",
      "timestamp_micros",
      "client_id",
      "EVENT_PARAMS",
      "REQUIRED_EVENT_PARAMS",
      "ALLOWED_VALUES",
    ].every((token) => files["analytics-worker/src/index.ts"].includes(token)) &&
      files["analytics-worker/wrangler.jsonc"].includes('"ratelimits"'),
  },
  {
    name: "privacy copy discloses the pseudonymous ID, processors, exclusions, and opt-out",
    pass:
      files["docs/privacy.html"].includes("pseudonymous installation ID") &&
      files["docs/privacy.html"].includes("Cloudflare") &&
      files["docs/privacy.html"].includes("Google Analytics") &&
      files["docs/privacy.html"].includes("does not cache or later replay") &&
      files["docs/privacy.html"].includes("不采集图片内容") &&
      files["docs/privacy.html"].includes("不缓存、不在以后补发"),
  },
  {
    name: "the analytics specification defines KPIs, events, and GA4 custom definitions",
    pass:
      files["docs/analytics.md"].includes("Daily active installations") &&
      files["docs/analytics.md"].includes("## Event Contract") &&
      files["docs/analytics.md"].includes("## GA4 Custom Definitions"),
  },
]

const failed = checks.filter((check) => !check.pass)

for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}`)
}

if (failed.length > 0) process.exit(1)

function findCalls(source, name) {
  const calls = []
  let index = 0

  while ((index = source.indexOf(`${name}(`, index)) !== -1) {
    let depth = 0
    let cursor = index + name.length

    for (; cursor < source.length; cursor++) {
      const char = source[cursor]
      if (char === "(") depth++
      if (char === ")") depth--
      if (depth === 0) {
        cursor++
        break
      }
    }

    calls.push(source.slice(index, cursor))
    index = cursor
  }

  return calls
}
