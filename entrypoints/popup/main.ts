import "../../assets/phosphor-icons.css"
import "./style.css"
import {
  PAGE_STATE_GET_MESSAGE,
  SITE_ENABLED_SET_MESSAGE,
  VIEW_HEIC_PROTOCOL_VERSION,
  isPageState,
  isPageStateChangedMessage,
  isSiteEnabledSetResponse,
  type PageState,
} from "../../utils/extension-messages"
import { getLocalizedFaqUrl, getLocalizedHelpUrl } from "../../utils/links"
import {
  getAnalyticsEnabled,
  setAnalyticsEnabled,
  trackAnalyticsEvent,
} from "../../utils/analytics"
import {
  getConnectedPresentation,
  getDisconnectedPresentation,
  getPopupLocale,
  type PopupPageAction,
  type PopupPresentation,
} from "../../utils/popup-view"

const locale = getPopupLocale(navigator.language)

const helpButton = getElement<HTMLButtonElement>("help-button")
const primaryStatus = getElement<HTMLElement>("primary-status")
const statusIcon = getElement<HTMLElement>("status-icon")
const statusHeadline = getElement<HTMLHeadingElement>("status-headline")
const pageRow = getElement<HTMLButtonElement>("page-row")
const pageLabel = getElement<HTMLElement>("page-label")
const pageValue = getElement<HTMLElement>("page-value")
const pageChevron = getElement<HTMLElement>("page-chevron")
const siteToggle = getElement<HTMLButtonElement>("site-toggle")
const siteToggleLabel = getElement<HTMLElement>("site-toggle-label")
const analyticsToggle = getElement<HTMLButtonElement>("analytics-toggle")
const analyticsToggleLabel = getElement<HTMLElement>("analytics-toggle-label")
const converterButton = getElement<HTMLButtonElement>("converter-button")
const converterLabel = getElement<HTMLElement>("converter-label")
const privacyLabel = getElement<HTMLElement>("privacy-label")
const actionFeedback = getElement<HTMLElement>("action-feedback")
const actionList = document.querySelector<HTMLElement>(".action-list")

let activeTab: Browser.tabs.Tab | undefined
let pageState: PageState | undefined
let pageAction: PopupPageAction | undefined
let currentPresentation: PopupPresentation
let togglePending = false
let analyticsEnabled = false
let analyticsPreferenceLoaded = false
let analyticsTogglePending = false

void initialize()

async function initialize(): Promise<void> {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"
  actionList?.setAttribute(
    "aria-label",
    locale === "zh" ? "View HEIC 控制" : "View HEIC controls"
  )

  helpButton.addEventListener("click", () => openHelpPage(getLocalizedHelpUrl(locale)))
  converterButton.addEventListener("click", openConverter)
  pageRow.addEventListener("click", handlePageAction)
  siteToggle.addEventListener("click", toggleSite)
  analyticsToggle.addEventListener("click", toggleAnalytics)
  browser.runtime.onMessage.addListener(handleRuntimeMessage)
  window.addEventListener(
    "unload",
    () => browser.runtime.onMessage.removeListener(handleRuntimeMessage),
    { once: true }
  )

  const [[tab], storedAnalyticsEnabled] = await Promise.all([
    browser.tabs.query({ active: true, currentWindow: true }),
    getAnalyticsEnabled(),
  ])
  activeTab = tab
  analyticsEnabled = storedAnalyticsEnabled
  analyticsPreferenceLoaded = true
  renderAnalyticsPreference()

  if (typeof tab?.id !== "number") {
    render(getDisconnectedPresentation(tab?.url, locale))
    trackPopupOpened("disconnected", "unavailable", false)
    return
  }

  try {
    const response = await browser.tabs.sendMessage(tab.id, {
      type: PAGE_STATE_GET_MESSAGE,
      protocol: VIEW_HEIC_PROTOCOL_VERSION,
    })

    if (!isPageState(response)) {
      throw new Error("Unexpected page state response")
    }

    pageState = response
    render(getConnectedPresentation(response, locale))
    trackPopupOpened("connected", response.phase, response.siteEnabled)
  } catch {
    render(getDisconnectedPresentation(tab.url, locale))
    trackPopupOpened("disconnected", "unavailable", false)
  }
}

function handleRuntimeMessage(message: unknown, sender: Browser.runtime.MessageSender): void {
  if (!isPageStateChangedMessage(message)) return
  if (sender.tab?.id !== activeTab?.id) return

  pageState = message.state
  render(getConnectedPresentation(message.state, locale))
}

function render(presentation: PopupPresentation): void {
  currentPresentation = presentation
  pageAction = presentation.pageAction
  const isBusy = presentation.tone === "working" && presentation.pageAction !== "refresh"
  primaryStatus.dataset.tone = presentation.tone
  primaryStatus.classList.toggle("is-busy", isBusy)
  primaryStatus.setAttribute("aria-busy", String(isBusy))
  statusIcon.className = `ph ${getStatusIcon(presentation)} status-icon`
  statusHeadline.textContent = presentation.headline

  pageLabel.textContent = presentation.pageLabel
  pageValue.textContent = presentation.pageValue
  pageRow.disabled = !presentation.pageAction
  pageRow.classList.toggle("is-actionable", Boolean(presentation.pageAction))
  pageChevron.classList.toggle("is-visible", Boolean(presentation.pageAction))

  siteToggleLabel.textContent = presentation.siteToggleLabel
  siteToggle.setAttribute("aria-checked", String(presentation.siteEnabled))
  siteToggle.disabled = presentation.toggleDisabled || togglePending

  converterLabel.textContent = presentation.converterLabel
  privacyLabel.textContent = presentation.privacyLabel
  helpButton.setAttribute("aria-label", presentation.helpLabel)
}

async function handlePageAction(): Promise<void> {
  if (pageAction === "refresh" && typeof activeTab?.id === "number") {
    await browser.tabs.reload(activeTab.id)
    window.close()
    return
  }

  if (pageAction === "troubleshoot") {
    await openHelpPage(getLocalizedFaqUrl(locale))
  }
}

async function toggleAnalytics(): Promise<void> {
  if (!analyticsPreferenceLoaded || analyticsTogglePending) return

  const previousAnalyticsEnabled = analyticsEnabled
  analyticsTogglePending = true
  analyticsToggle.disabled = true
  actionFeedback.textContent = ""
  try {
    analyticsEnabled = !previousAnalyticsEnabled
    await setAnalyticsEnabled(analyticsEnabled)
    renderAnalyticsPreference()
  } catch {
    analyticsEnabled = await getAnalyticsEnabled().catch(() => previousAnalyticsEnabled)
    renderAnalyticsPreference()
    actionFeedback.textContent =
      locale === "zh" ? "无法更新使用数据设置。" : "Couldn’t update the usage data setting."
  } finally {
    analyticsTogglePending = false
    renderAnalyticsPreference()
  }
}

function renderAnalyticsPreference(): void {
  analyticsToggleLabel.textContent =
    locale === "zh" ? "共享基本使用数据" : "Share basic usage data"
  analyticsToggle.setAttribute("aria-checked", String(analyticsEnabled))
  analyticsToggle.disabled = !analyticsPreferenceLoaded || analyticsTogglePending
}

async function toggleSite(): Promise<void> {
  if (togglePending || typeof activeTab?.id !== "number" || !pageState) return

  const previousState = pageState
  const nextEnabled = !pageState.siteEnabled
  actionFeedback.textContent = ""
  togglePending = true
  render({
    ...currentPresentation,
    siteEnabled: nextEnabled,
    toggleDisabled: true,
  })

  try {
    const response = await browser.tabs.sendMessage(activeTab.id, {
      type: SITE_ENABLED_SET_MESSAGE,
      protocol: VIEW_HEIC_PROTOCOL_VERSION,
      enabled: nextEnabled,
      expectedPageInstanceId: pageState.pageInstanceId,
    })

    if (!isSiteEnabledSetResponse(response)) {
      throw new Error("Unexpected site preference response")
    }
    if (!response.ok) {
      pageState = response.state
      actionFeedback.textContent =
        response.error === "stale-document"
          ? locale === "zh"
            ? "页面已变化，请再试一次。"
            : "The page changed. Try again."
          : locale === "zh"
            ? "无法更新此网站的设置。"
            : "Couldn’t update this site setting."
      return
    }

    pageState = response.state
    render(getConnectedPresentation(response.state, locale))
  } catch {
    pageState = previousState
    render(getConnectedPresentation(previousState, locale))
    actionFeedback.textContent =
      locale === "zh" ? "无法更新此网站的设置。" : "Couldn’t update this site setting."
  } finally {
    togglePending = false
    render(getConnectedPresentation(pageState, locale))
  }
}

async function openConverter(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL("/converter.html") })
  window.close()
}

async function openExternalPage(url: string): Promise<void> {
  await browser.tabs.create({ url })
  window.close()
}

async function openHelpPage(url: string): Promise<void> {
  void trackAnalyticsEvent("help_opened", { surface: "popup" })
  await openExternalPage(url)
}

function trackPopupOpened(
  connectionState: "connected" | "disconnected",
  pagePhase: string,
  siteEnabled: boolean
): void {
  void trackAnalyticsEvent("popup_opened", {
    connection_state: connectionState,
    page_phase: pagePhase,
    site_enabled: siteEnabled,
  })
}

function getStatusIcon(presentation: PopupPresentation): string {
  if (presentation.pageAction === "refresh") return "ph-arrow-clockwise"
  if (presentation.tone === "success") return "ph-check-circle"
  if (presentation.tone === "working") return "ph-circle-notch"
  if (presentation.tone === "partial") return "ph-warning-circle"
  if (presentation.tone === "warning") return "ph-warning-circle"
  if (presentation.tone === "muted") return "ph-pause-circle"
  return "ph-circle-dashed"
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing popup element: ${id}`)
  return element as T
}
