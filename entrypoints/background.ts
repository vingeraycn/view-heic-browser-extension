const OFFICIAL_SITE_URL = "https://vingeraycn.github.io/view-heic-browser-extension/?welcome=1#how-it-works"

export default defineBackground(() => {
  console.log("🚀 View HEIC Extension Background Loaded")

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      console.log("🎉 View HEIC Extension 安装成功！")
      browser.tabs.create({ url: OFFICIAL_SITE_URL })
    } else if (details.reason === "update") {
      console.log("🔄 View HEIC Extension 已更新到新版本")
    }
  })
})
