import { defineConfig } from "wxt"

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: "View HEIC",
    description: "View HEIC as Normal Image in Your Browser",
  },
  runner: {
    disabled: true,
  },
})
