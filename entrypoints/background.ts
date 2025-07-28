export default defineBackground(() => {
  console.log("🚀 View HEIC Extension Background Loaded")

  // 扩展安装时显示欢迎信息
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      console.log("🎉 View HEIC Extension 安装成功！")
    } else if (details.reason === "update") {
      console.log("🔄 View HEIC Extension 已更新到新版本")
    }
  })
})
