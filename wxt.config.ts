import { defineConfig } from "wxt"

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: () => ({
    name: "View HEIC",
    description: "View HEIC as Normal Image in Your Browser",
    permissions: ["storage"],
    host_permissions:
      import.meta.env.WXT_ENABLE_EXTENSION_ANALYTICS === "true"
        ? ["https://www.google-analytics.com/*"]
        : [],
  }),
  webExt: {
    disabled: true,
  },
})
