export const VIEW_HEIC_PROTOCOL_VERSION = 1 as const
export const PAGE_STATE_GET_MESSAGE = "view-heic:page-state:get"
export const PAGE_STATE_CHANGED_MESSAGE = "view-heic:page-state:changed"
export const SITE_ENABLED_SET_MESSAGE = "view-heic:site-enabled:set"

export type PagePhase =
  | "initializing"
  | "idle"
  | "converting"
  | "complete"
  | "error"
  | "disabled"

export interface PageState {
  protocol: typeof VIEW_HEIC_PROTOCOL_VERSION
  extensionVersion: string
  pageInstanceId: string
  siteHost: string
  siteEnabled: boolean
  phase: PagePhase
  detected: number
  converted: number
  failed: number
}

export interface PageStateGetMessage {
  type: typeof PAGE_STATE_GET_MESSAGE
  protocol: typeof VIEW_HEIC_PROTOCOL_VERSION
}

export interface SiteEnabledSetMessage {
  type: typeof SITE_ENABLED_SET_MESSAGE
  protocol: typeof VIEW_HEIC_PROTOCOL_VERSION
  enabled: boolean
  expectedPageInstanceId: string
}

export interface PageStateChangedMessage {
  type: typeof PAGE_STATE_CHANGED_MESSAGE
  protocol: typeof VIEW_HEIC_PROTOCOL_VERSION
  state: PageState
}

export type PopupToContentMessage = PageStateGetMessage | SiteEnabledSetMessage

export type SiteEnabledSetResponse =
  | {
      ok: true
      state: PageState
    }
  | {
      ok: false
      error: "stale-document" | "storage-failed"
      state: PageState
    }

export function createInitialPageState(siteHost: string): PageState {
  return {
    protocol: VIEW_HEIC_PROTOCOL_VERSION,
    extensionVersion: browser.runtime.getManifest().version,
    pageInstanceId: crypto.randomUUID(),
    siteHost,
    siteEnabled: true,
    phase: "initializing",
    detected: 0,
    converted: 0,
    failed: 0,
  }
}

export function isPageStateGetMessage(message: unknown): message is PageStateGetMessage {
  return (
    isRecord(message) &&
    message.type === PAGE_STATE_GET_MESSAGE &&
    message.protocol === VIEW_HEIC_PROTOCOL_VERSION
  )
}

export function isSiteEnabledSetMessage(message: unknown): message is SiteEnabledSetMessage {
  return (
    isRecord(message) &&
    message.type === SITE_ENABLED_SET_MESSAGE &&
    message.protocol === VIEW_HEIC_PROTOCOL_VERSION &&
    typeof message.enabled === "boolean" &&
    typeof message.expectedPageInstanceId === "string"
  )
}

export function isPageStateChangedMessage(message: unknown): message is PageStateChangedMessage {
  return (
    isRecord(message) &&
    message.type === PAGE_STATE_CHANGED_MESSAGE &&
    message.protocol === VIEW_HEIC_PROTOCOL_VERSION &&
    isPageState(message.state)
  )
}

export function isSiteEnabledSetResponse(value: unknown): value is SiteEnabledSetResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean" || !isPageState(value.state)) {
    return false
  }

  if (value.ok) return true
  return value.error === "stale-document" || value.error === "storage-failed"
}

export function isPageState(value: unknown): value is PageState {
  if (!isRecord(value)) return false

  return (
    value.protocol === VIEW_HEIC_PROTOCOL_VERSION &&
    typeof value.extensionVersion === "string" &&
    typeof value.pageInstanceId === "string" &&
    typeof value.siteHost === "string" &&
    typeof value.siteEnabled === "boolean" &&
    isPagePhase(value.phase) &&
    isNonNegativeNumber(value.detected) &&
    isNonNegativeNumber(value.converted) &&
    isNonNegativeNumber(value.failed)
  )
}

function isPagePhase(value: unknown): value is PagePhase {
  return (
    value === "initializing" ||
    value === "idle" ||
    value === "converting" ||
    value === "complete" ||
    value === "error" ||
    value === "disabled"
  )
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
