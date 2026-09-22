import type { PageState } from "./extension-messages"

export type PopupTone = "neutral" | "success" | "working" | "partial" | "warning" | "muted"
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

export function getConnectedPresentation(state: PageState): PopupPresentation {
  const base = getBaseCopy()

  if (!state.siteEnabled || state.phase === "disabled") {
    return {
      ...base,
      headline: "Off on this site",
      pageValue: "Not checking",
      tone: "muted",
      siteEnabled: false,
      toggleDisabled: false,
    }
  }

  if (state.phase === "initializing") {
    return {
      ...base,
      headline: "Checking this page",
      pageValue: "Checking",
      tone: "neutral",
      siteEnabled: true,
      toggleDisabled: true,
    }
  }

  if (state.phase === "converting") {
    return {
      ...base,
      headline: "Making HEIC visible…",
      pageValue: formatCount(state.detected, "image", "images"),
      tone: "working",
      siteEnabled: true,
      toggleDisabled: false,
    }
  }

  if (state.phase === "complete") {
    if (state.failed > 0) {
      return getFailurePresentation(state, base)
    }

    return {
      ...base,
      headline: "Working automatically",
      pageValue: formatCount(state.converted, "visible", "visible"),
      tone: "success",
      siteEnabled: true,
      toggleDisabled: false,
    }
  }

  if (state.phase === "error") {
    return getFailurePresentation(state, base)
  }

  return {
    ...base,
    headline: "Working automatically",
    pageValue: "No HEIC found",
    tone: "success",
    siteEnabled: true,
    toggleDisabled: false,
  }
}

export function getDisconnectedPresentation(
  url: string | undefined
): PopupPresentation {
  const base = getBaseCopy()

  if (isContentScriptEligibleUrl(url)) {
    return {
      ...base,
      headline: "Refresh once",
      pageValue: "Refresh",
      pageAction: "refresh",
      tone: "working",
      siteEnabled: true,
      toggleDisabled: true,
    }
  }

  return {
    ...base,
    headline: "Not available here",
    pageValue: "Not supported",
    tone: "muted",
    siteEnabled: false,
    toggleDisabled: true,
  }
}

function getBaseCopy() {
  return {
    pageLabel: "This page",
    pageValue: "",
    siteToggleLabel: "View HEIC on this site",
    converterLabel: "Convert a file",
    privacyLabel: "Converted on this device",
    helpLabel: "Help and troubleshooting",
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
  base: ReturnType<typeof getBaseCopy>
): PopupPresentation {
  const total = Math.max(state.detected, state.converted + state.failed)
  const hasVisibleImage = state.converted > 0

  return {
    ...base,
    headline: hasVisibleImage
      ? formatCount(state.converted, "image converted", "images converted")
      : "Couldn’t show HEIC",
    pageValue: hasVisibleImage ? `${state.converted} of ${total} visible` : "See why",
    pageAction: "troubleshoot",
    tone: hasVisibleImage ? "partial" : "warning",
    siteEnabled: true,
    toggleDisabled: false,
  }
}
