import { describe, expect, it } from "vitest"
import {
  VIEW_HEIC_PROTOCOL_VERSION,
  type PagePhase,
  type PageState,
} from "../../utils/extension-messages"
import {
  getConnectedPresentation,
  getDisconnectedPresentation,
  getPopupLocale,
  isContentScriptEligibleUrl,
  type PopupLocale,
  type PopupTone,
} from "../../utils/popup-view"

function createPageState(overrides: Partial<PageState> = {}): PageState {
  return {
    protocol: VIEW_HEIC_PROTOCOL_VERSION,
    extensionVersion: "1.2.0",
    pageInstanceId: "page-instance-for-test",
    siteHost: "example.com",
    siteEnabled: true,
    phase: "idle",
    detected: 0,
    converted: 0,
    failed: 0,
    ...overrides,
  }
}

interface ConnectedStateExpectation {
  phase: PagePhase
  state?: Partial<PageState>
  tone: PopupTone
  siteEnabled: boolean
  toggleDisabled: boolean
  pageAction?: "refresh" | "troubleshoot"
  copy: Record<PopupLocale, { headline: string; pageValue: string; converterLabel: string }>
}

const connectedStates: ConnectedStateExpectation[] = [
  {
    phase: "initializing",
    tone: "neutral",
    siteEnabled: true,
    toggleDisabled: true,
    copy: {
      zh: {
        headline: "正在检查页面",
        pageValue: "正在检查",
        converterLabel: "转换文件",
      },
      en: {
        headline: "Checking this page",
        pageValue: "Checking",
        converterLabel: "Convert a file",
      },
    },
  },
  {
    phase: "idle",
    tone: "success",
    siteEnabled: true,
    toggleDisabled: false,
    copy: {
      zh: {
        headline: "自动工作中",
        pageValue: "未发现 HEIC",
        converterLabel: "转换文件",
      },
      en: {
        headline: "Working automatically",
        pageValue: "No HEIC found",
        converterLabel: "Convert a file",
      },
    },
  },
  {
    phase: "converting",
    state: { detected: 2 },
    tone: "working",
    siteEnabled: true,
    toggleDisabled: false,
    copy: {
      zh: {
        headline: "正在显示 HEIC…",
        pageValue: "2 张",
        converterLabel: "转换文件",
      },
      en: {
        headline: "Making HEIC visible…",
        pageValue: "2 images",
        converterLabel: "Convert a file",
      },
    },
  },
  {
    phase: "complete",
    state: { detected: 2, converted: 2 },
    tone: "success",
    siteEnabled: true,
    toggleDisabled: false,
    copy: {
      zh: {
        headline: "自动工作中",
        pageValue: "已显示 2 张",
        converterLabel: "转换文件",
      },
      en: {
        headline: "Working automatically",
        pageValue: "2 visible",
        converterLabel: "Convert a file",
      },
    },
  },
  {
    phase: "error",
    state: { detected: 2, failed: 2 },
    tone: "warning",
    siteEnabled: true,
    toggleDisabled: false,
    pageAction: "troubleshoot",
    copy: {
      zh: {
        headline: "无法显示 HEIC",
        pageValue: "查看原因",
        converterLabel: "转换文件",
      },
      en: {
        headline: "Couldn’t show HEIC",
        pageValue: "See why",
        converterLabel: "Convert a file",
      },
    },
  },
  {
    phase: "disabled",
    state: { siteEnabled: false },
    tone: "muted",
    siteEnabled: false,
    toggleDisabled: false,
    copy: {
      zh: {
        headline: "已对本网站关闭",
        pageValue: "未检查",
        converterLabel: "转换文件",
      },
      en: {
        headline: "Off on this site",
        pageValue: "Not checking",
        converterLabel: "Convert a file",
      },
    },
  },
]

describe("getPopupLocale", () => {
  it.each([
    ["zh-CN", "zh"],
    ["ZH-hant", "zh"],
    ["en-US", "en"],
    ["ja-JP", "en"],
    ["", "en"],
  ] as const)("maps %s to %s", (language, expectedLocale) => {
    expect(getPopupLocale(language)).toBe(expectedLocale)
  })
})

describe("getConnectedPresentation", () => {
  const localizedConnectedStates = connectedStates.flatMap((entry) =>
    (["zh", "en"] as const).map((locale) => ({
      ...entry,
      locale,
    }))
  )

  it.each(localizedConnectedStates)(
    "presents $phase in $locale with the agreed hierarchy",
    (entry) => {
      const { locale } = entry
      const presentation = getConnectedPresentation(
        createPageState({ phase: entry.phase, ...entry.state }),
        locale
      )

      expect(presentation).toMatchObject({
        headline: entry.copy[locale].headline,
        pageLabel: locale === "zh" ? "当前页面" : "This page",
        pageValue: entry.copy[locale].pageValue,
        siteToggleLabel:
          locale === "zh" ? "在此网站启用 View HEIC" : "View HEIC on this site",
        converterLabel: entry.copy[locale].converterLabel,
        privacyLabel: locale === "zh" ? "仅在本机转换" : "Converted on this device",
        helpLabel: locale === "zh" ? "帮助与问题排查" : "Help and troubleshooting",
        tone: entry.tone,
        siteEnabled: entry.siteEnabled,
        toggleDisabled: entry.toggleDisabled,
      })
      expect(presentation.pageAction).toBe(entry.pageAction)
    }
  )

  it("treats a disabled site as authoritative even if the phase is stale", () => {
    const presentation = getConnectedPresentation(
      createPageState({ phase: "complete", siteEnabled: false, converted: 1 }),
      "zh"
    )

    expect(presentation).toMatchObject({
      headline: "已对本网站关闭",
      pageValue: "未检查",
      siteEnabled: false,
    })
    expect(presentation.pageAction).toBeUndefined()
  })

  it("keeps English counts terse without losing their state context", () => {
    expect(
      getConnectedPresentation(
        createPageState({ phase: "complete", detected: 1, converted: 1 }),
        "en"
      ).pageValue
    ).toBe("1 visible")

    expect(
      getConnectedPresentation(
        createPageState({ phase: "converting", detected: 1 }),
        "en"
      ).pageValue
    ).toBe("1 image")
  })

  it.each([
    ["zh", "已转换 1 张图片", "已显示 1/2 张"],
    ["en", "1 image converted", "1 of 2 visible"],
  ] as const)("keeps partial success visible while offering troubleshooting in %s", (locale, headline, pageValue) => {
    const presentation = getConnectedPresentation(
      createPageState({
        phase: "complete",
        detected: 2,
        converted: 1,
        failed: 1,
      }),
      locale
    )

    expect(presentation).toMatchObject({
      headline,
      pageValue,
      pageAction: "troubleshoot",
      tone: "partial",
    })
  })

  it("uses a plural success headline when several images were converted", () => {
    expect(
      getConnectedPresentation(
        createPageState({ phase: "error", detected: 4, converted: 3, failed: 1 }),
        "en"
      ).headline
    ).toBe("3 images converted")
  })
})

describe("isContentScriptEligibleUrl", () => {
  it.each([
    "https://example.com/photo.heic",
    "http://localhost:8080/test-improved.html",
    "https://subdomain.example.com/path",
  ])("accepts an ordinary web page: %s", (url) => {
    expect(isContentScriptEligibleUrl(url)).toBe(true)
  })

  it.each([
    undefined,
    "",
    "not a url",
    "chrome://extensions/",
    "edge://extensions/",
    "about:blank",
    "file:///Users/example/photo.heic",
    "https://chromewebstore.google.com/detail/example",
    "https://chrome.google.com/webstore/detail/example",
    "https://addons.mozilla.org/firefox/addon/example/",
  ])("rejects a restricted or unsupported page: %s", (url) => {
    expect(isContentScriptEligibleUrl(url)).toBe(false)
  })
})

describe("getDisconnectedPresentation", () => {
  it.each([
    [
      "zh",
      {
        headline: "刷新一次",
        pageValue: "刷新",
        converterLabel: "转换文件",
      },
    ],
    [
      "en",
      {
        headline: "Refresh once",
        pageValue: "Refresh",
        converterLabel: "Convert a file",
      },
    ],
  ] as const)("offers refresh only for an eligible disconnected page in %s", (locale, copy) => {
    const presentation = getDisconnectedPresentation("https://example.com/photo.heic", locale)

    expect(presentation).toMatchObject({
      ...copy,
      pageAction: "refresh",
      siteEnabled: true,
      toggleDisabled: true,
      tone: "working",
    })
  })

  it.each([
    [
      "zh",
      {
        headline: "此页面不可用",
        pageValue: "不支持此页面",
        converterLabel: "转换文件",
      },
    ],
    [
      "en",
      {
        headline: "Not available here",
        pageValue: "Not supported",
        converterLabel: "Convert a file",
      },
    ],
  ] as const)("keeps conversion available without a page action on a restricted page in %s", (locale, copy) => {
    const presentation = getDisconnectedPresentation("chrome://extensions/", locale)

    expect(presentation).toMatchObject({
      ...copy,
      siteEnabled: false,
      toggleDisabled: true,
      tone: "muted",
    })
    expect(presentation.pageAction).toBeUndefined()
  })
})
