import type { PageState } from "./extension-messages"

export type PopupLocale = "en" | "zh"
export type PopupTone = "neutral" | "success" | "working" | "warning" | "muted"
export type PopupPageAction = "refresh" | "troubleshoot"

export interface PopupPresentation {
  headline: string
  pageLabel: string
  pageValue: string
  pageAction?: PopupPageAction
  siteToggleLabel: string
  converterLabel: string
  privacyLabel: string
  helpLabel: string
  tone: PopupTone
  siteEnabled: boolean
  toggleDisabled: boolean
}

const RESTRICTED_WEB_HOSTS = new Set([
  "chromewebstore.google.com",
  "chrome.google.com",
  "addons.mozilla.org",
])

export function getPopupLocale(language: string): PopupLocale {
  return language.toLowerCase().startsWith("zh") ? "zh" : "en"
}

export function isContentScriptEligibleUrl(url: string | undefined): boolean {
  if (!url) return false

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false
    return !RESTRICTED_WEB_HOSTS.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

export function getConnectedPresentation(
  state: PageState,
  locale: PopupLocale
): PopupPresentation {
  const base = getBaseCopy(locale)

  if (!state.siteEnabled || state.phase === "disabled") {
    return {
      ...base,
      headline: locale === "zh" ? "已对本网站关闭" : "Off on this site",
      pageValue: locale === "zh" ? "未检查" : "Not checking",
      tone: "muted",
      siteEnabled: false,
      toggleDisabled: false,
    }
  }

  if (state.phase === "initializing") {
    return {
      ...base,
      headline: locale === "zh" ? "正在检查页面" : "Checking this page",
      pageValue: locale === "zh" ? "正在检查" : "Checking",
      tone: "neutral",
      siteEnabled: true,
      toggleDisabled: true,
    }
  }

  if (state.phase === "converting") {
    return {
      ...base,
      headline: locale === "zh" ? "正在显示 HEIC…" : "Making HEIC visible…",
      pageValue:
        locale === "zh"
          ? `${state.detected} 张`
          : formatCount(state.detected, "image", "images"),
      tone: "working",
      siteEnabled: true,
      toggleDisabled: false,
    }
  }

  if (state.phase === "complete") {
    if (state.failed > 0) {
      return getFailurePresentation(state, locale, base)
    }

    return {
      ...base,
      headline: locale === "zh" ? "自动工作中" : "Working automatically",
      pageValue:
        locale === "zh"
          ? `已显示 ${state.converted} 张`
          : formatCount(state.converted, "visible", "visible"),
      tone: "success",
      siteEnabled: true,
      toggleDisabled: false,
    }
  }

  if (state.phase === "error") {
    return getFailurePresentation(state, locale, base)
  }

  return {
    ...base,
    headline: locale === "zh" ? "自动工作中" : "Working automatically",
    pageValue: locale === "zh" ? "未发现 HEIC" : "No HEIC found",
    tone: "success",
    siteEnabled: true,
    toggleDisabled: false,
  }
}

export function getDisconnectedPresentation(
  url: string | undefined,
  locale: PopupLocale
): PopupPresentation {
  const base = getBaseCopy(locale)

  if (isContentScriptEligibleUrl(url)) {
    return {
      ...base,
      headline: locale === "zh" ? "刷新一次" : "Refresh once",
      pageValue: locale === "zh" ? "刷新" : "Refresh",
      pageAction: "refresh",
      tone: "working",
      siteEnabled: true,
      toggleDisabled: true,
    }
  }

  return {
    ...base,
    headline: locale === "zh" ? "此页面不可用" : "Not available here",
    pageValue: locale === "zh" ? "不支持此页面" : "Not supported",
    tone: "muted",
    siteEnabled: false,
    toggleDisabled: true,
  }
}

function getBaseCopy(locale: PopupLocale) {
  return {
    pageLabel: locale === "zh" ? "当前页面" : "This page",
    pageValue: "",
    siteToggleLabel: locale === "zh" ? "在此网站启用 View HEIC" : "View HEIC on this site",
    converterLabel: locale === "zh" ? "转换文件" : "Convert a file",
    privacyLabel: locale === "zh" ? "仅在本机转换" : "Converted on this device",
    helpLabel: locale === "zh" ? "帮助与问题排查" : "Help and troubleshooting",
    tone: "neutral" as PopupTone,
    siteEnabled: true,
    toggleDisabled: false,
  }
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function getFailurePresentation(
  state: PageState,
  locale: PopupLocale,
  base: ReturnType<typeof getBaseCopy>
): PopupPresentation {
  const total = Math.max(state.detected, state.converted + state.failed)
  const hasVisibleImage = state.converted > 0

  return {
    ...base,
    headline: locale === "zh" ? "无法显示 HEIC" : "Couldn’t show HEIC",
    pageValue: hasVisibleImage
      ? locale === "zh"
        ? `已显示 ${state.converted}/${total} 张`
        : `${state.converted} of ${total} visible`
      : locale === "zh"
        ? "查看原因"
        : "See why",
    pageAction: "troubleshoot",
    tone: "warning",
    siteEnabled: true,
    toggleDisabled: false,
  }
}
