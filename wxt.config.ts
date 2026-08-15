import { defineConfig } from "wxt"
import { fileURLToPath } from "node:url"

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: () => ({
    name: "View HEIC",
    description: "View HEIC as Normal Image in Your Browser",
    permissions: ["storage", "activeTab"],
    host_permissions: getAnalyticsHostPermissions(),
  }),
  vite: () => ({
    resolve: {
      alias: {
        "@heic-to-csp-lib": fileURLToPath(
          new URL(
            "./node_modules/heic-to/src/lib/libheif-without-unsafe-eval.js",
            import.meta.url
          )
        ),
      },
    },
  }),
  webExt: {
    disabled: true,
  },
})

function getAnalyticsHostPermissions(): string[] {
  if (import.meta.env.WXT_ENABLE_EXTENSION_ANALYTICS !== "true") return []

  const endpointValue = import.meta.env.WXT_ANALYTICS_ENDPOINT
  if (!endpointValue) {
    throw new Error("WXT_ANALYTICS_ENDPOINT is required when extension analytics are enabled")
  }

  try {
    const endpoint = new URL(endpointValue)
    if (endpoint.protocol !== "https:") {
      throw new Error("WXT_ANALYTICS_ENDPOINT must use HTTPS")
    }
    if (
      endpoint.hostname === "google-analytics.com" ||
      endpoint.hostname.endsWith(".google-analytics.com")
    ) {
      throw new Error("WXT_ANALYTICS_ENDPOINT must be a first-party validation proxy")
    }
    return [`${endpoint.origin}/*`]
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("WXT_ANALYTICS_ENDPOINT")) {
      throw error
    }
    throw new Error("WXT_ANALYTICS_ENDPOINT must be a valid HTTPS URL", { cause: error })
  }
}
