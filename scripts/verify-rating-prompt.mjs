import { readFileSync } from "node:fs"

const content = readFileSync("entrypoints/content.ts", "utf8")
const config = readFileSync("wxt.config.ts", "utf8")

const checks = [
  {
    name: "rating prompt uses localized copy with the real converted count",
    pass:
      content.includes("MIN_SUCCESSFUL_IMAGES_FOR_PROMPT = 5") &&
      content.includes("View HEIC 插件帮你显示了 ${successCount} 张图片") &&
      content.includes("View HEIC helped you display ${successCount} images") &&
      content.includes("去商店评价") &&
      content.includes("Review in store"),
  },
  {
    name: "rating prompt tracks successful conversions cumulatively",
    pass:
      content.includes("import.meta.env.FIREFOX") &&
      content.includes("successCount === 0") &&
      content.includes("nextSuccessCount < MIN_SUCCESSFUL_IMAGES_FOR_PROMPT") &&
      content.includes("showRatingPrompt(nextSuccessCount)") &&
      content.includes("MIN_SUCCESSFUL_IMAGES_FOR_PROMPT"),
  },
  {
    name: "review tab opens before persisting review state",
    pass:
      content.indexOf('window.open(STORE_REVIEW_URL, "_blank", "noopener")') <
      content.indexOf("[RATING_PROMPT_STORAGE_KEY]: { reviewClicked: true"),
  },
  {
    name: "rating prompt has local storage permission",
    pass: /permissions\s*:\s*\[[^\]]*["']storage["'][^\]]*\]/m.test(config),
  },
]

const failed = checks.filter((check) => !check.pass)

for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}`)
}

if (failed.length > 0) {
  process.exit(1)
}
