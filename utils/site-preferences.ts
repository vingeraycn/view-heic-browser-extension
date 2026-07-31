export const SITE_PREFERENCES_STORAGE_KEY = "viewHeicSitePreferences"
export const SITE_PREFERENCE_STORAGE_PREFIX = "viewHeicSiteEnabled:"
export const INTERCEPTOR_READY_EVENT = "view-heic:interceptor-ready"
export const INTERCEPTOR_ENABLE_EVENT = "view-heic:interceptor-enable"
export const INTERCEPTOR_DISABLE_EVENT = "view-heic:interceptor-disable"

export interface SitePreferencesV1 {
  schemaVersion: 1
  disabledHosts: string[]
}

const EMPTY_PREFERENCES: SitePreferencesV1 = {
  schemaVersion: 1,
  disabledHosts: [],
}

export function getSiteHost(url: string): string | undefined {
  try {
    const parsed = new URL(url)

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.hostname.toLowerCase()
    }

    if (parsed.protocol === "file:") {
      return "file"
    }
  } catch {
    // Invalid URLs are treated as unsupported surfaces.
  }

  return undefined
}

export function normalizeSitePreferences(value: unknown): SitePreferencesV1 {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.disabledHosts)) {
    return { ...EMPTY_PREFERENCES }
  }

  const disabledHosts = Array.from(
    new Set(
      value.disabledHosts
        .filter((host): host is string => typeof host === "string")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean)
    )
  )

  return {
    schemaVersion: 1,
    disabledHosts,
  }
}

export async function getSiteEnabled(host: string): Promise<boolean> {
  const siteKey = getSitePreferenceStorageKey(host)
  const stored = await browser.storage.local.get([siteKey, SITE_PREFERENCES_STORAGE_KEY])
  if (typeof stored[siteKey] === "boolean") {
    return stored[siteKey]
  }

  return !normalizeSitePreferences(stored[SITE_PREFERENCES_STORAGE_KEY]).disabledHosts.includes(
    host.toLowerCase()
  )
}

export async function setSiteEnabled(host: string, enabled: boolean): Promise<boolean> {
  const normalizedHost = host.trim().toLowerCase()
  if (!normalizedHost) {
    throw new Error("A site host is required")
  }

  await browser.storage.local.set({
    [getSitePreferenceStorageKey(normalizedHost)]: enabled,
  })

  return enabled
}

export function isSiteEnabledInPreferences(value: unknown, host: string): boolean {
  return !normalizeSitePreferences(value).disabledHosts.includes(host.toLowerCase())
}

export function getSitePreferenceStorageKey(host: string): string {
  return `${SITE_PREFERENCE_STORAGE_PREFIX}${encodeURIComponent(host.trim().toLowerCase())}`
}

export function getSiteEnabledFromChanges(
  changes: Record<string, Browser.storage.StorageChange>,
  host: string
): boolean | undefined {
  const siteKey = getSitePreferenceStorageKey(host)
  if (changes[siteKey]) {
    return typeof changes[siteKey].newValue === "boolean" ? changes[siteKey].newValue : true
  }

  if (changes[SITE_PREFERENCES_STORAGE_KEY]) {
    return isSiteEnabledInPreferences(changes[SITE_PREFERENCES_STORAGE_KEY].newValue, host)
  }

  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
