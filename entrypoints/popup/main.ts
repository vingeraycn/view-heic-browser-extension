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
import { FAQ_URL, HELP_URL } from "../../utils/links"
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

void initialize()

async function initialize(): Promise<void> {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"
  actionList?.setAttribute(
    "aria-label",
    locale === "zh" ? "View HEIC 控制" : "View HEIC controls"
  )

  helpButton.addEventListener("click", () => openExternalPage(HELP_URL))
  converterButton.addEventListener("click", openConverter)
  pageRow.addEventListener("click", handlePageAction)
  siteToggle.addEventListener("click", toggleSite)
  browser.runtime.onMessage.addListener(handleRuntimeMessage)
  window.addEventListener(
    "unload",
    () => browser.runtime.onMessage.removeListener(handleRuntimeMessage),
    { once: true }
  )

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  activeTab = tab

  if (typeof tab?.id !== "number") {
    render(getDisconnectedPresentation(tab?.url, locale))
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
  } catch {
    render(getDisconnectedPresentation(tab.url, locale))
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
    await openExternalPage(FAQ_URL)
  }
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

function getStatusIcon(presentation: PopupPresentation): string {
  if (presentation.pageAction === "refresh") return "ph-arrow-clockwise"
  if (presentation.tone === "success") return "ph-check-circle"
  if (presentation.tone === "working") return "ph-circle-notch"
  if (presentation.tone === "warning") return "ph-warning-circle"
  if (presentation.tone === "muted") return "ph-pause-circle"
  return "ph-circle-dashed"
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing popup element: ${id}`)
  return element as T
}
