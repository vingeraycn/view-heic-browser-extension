import { defineConfig } from "wxt"

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "View HEIC",
    description: "View HEIC as Normal Image in Your Browser",
    host_permissions: ["<all_urls>"],
  },
  runner: {
    disabled: true,
  },
})
