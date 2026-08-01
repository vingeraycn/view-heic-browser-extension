import { defineConfig } from "wxt"
import { fileURLToPath } from "node:url"

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: () => ({
    name: "View HEIC",
    description: "View HEIC as Normal Image in Your Browser",
    permissions: ["storage", "activeTab"],
    host_permissions:
      import.meta.env.WXT_ENABLE_EXTENSION_ANALYTICS === "true"
        ? ["https://www.google-analytics.com/*"]
        : [],
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
