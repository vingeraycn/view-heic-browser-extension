import { beforeEach, describe, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import {
  SITE_PREFERENCES_STORAGE_KEY,
  getSiteEnabled,
  getSiteEnabledFromChanges,
  getSiteHost,
  getSitePreferenceStorageKey,
  isSiteEnabledInPreferences,
  normalizeSitePreferences,
  setSiteEnabled,
} from "../../utils/site-preferences"

beforeEach(() => {
  fakeBrowser.reset()
})

describe("getSiteHost", () => {
  it.each([
    ["https://Example.COM/gallery/photo.heic?download=1#preview", "example.com"],
    ["http://LOCALHOST:8080/test-improved.html", "localhost"],
    ["file:///Users/example/Pictures/photo.heic", "file"],
  ])("normalizes supported URL %s", (url, expectedHost) => {
    expect(getSiteHost(url)).toBe(expectedHost)
  })

  it.each([
    "chrome://extensions/",
    "edge://extensions/",
    "about:blank",
    "data:text/plain,hello",
    "not a url",
    "",
  ])("rejects unsupported URL %s", (url) => {
    expect(getSiteHost(url)).toBeUndefined()
  })
})

describe("normalizeSitePreferences", () => {
  it("normalizes, de-duplicates, and removes invalid disabled hosts", () => {
    expect(
      normalizeSitePreferences({
        schemaVersion: 1,
        disabledHosts: [
          " Example.COM ",
          "example.com",
          "",
          "  ",
          "Another.Example",
          42,
          null,
        ],
      })
    ).toEqual({
      schemaVersion: 1,
      disabledHosts: ["example.com", "another.example"],
    })
  })

  it.each([
    undefined,
    null,
    [],
    {},
    { schemaVersion: 2, disabledHosts: ["example.com"] },
    { schemaVersion: 1, disabledHosts: "example.com" },
  ])("falls back to empty v1 preferences for malformed value %#", (value) => {
    expect(normalizeSitePreferences(value)).toEqual({
      schemaVersion: 1,
      disabledHosts: [],
    })
  })
})

describe("isSiteEnabledInPreferences", () => {
  const preferences = {
    schemaVersion: 1,
    disabledHosts: [" Example.COM ", "photos.example"],
  }

  it("matches disabled hosts case-insensitively", () => {
    expect(isSiteEnabledInPreferences(preferences, "EXAMPLE.com")).toBe(false)
    expect(isSiteEnabledInPreferences(preferences, "Photos.Example")).toBe(false)
  })

  it("enables hosts that are not in the disabled set", () => {
    expect(isSiteEnabledInPreferences(preferences, "other.example")).toBe(true)
  })

  it("defaults to enabled when stored preferences are malformed", () => {
    expect(isSiteEnabledInPreferences({ schemaVersion: 0 }, "example.com")).toBe(true)
  })
})

describe("per-site storage changes", () => {
  it("uses one stable key per normalized hostname", () => {
    expect(getSitePreferenceStorageKey(" Example.COM ")).toBe(
      "viewHeicSiteEnabled:example.com"
    )
  })

  it("reads a direct site override without touching another hostname", () => {
    const key = getSitePreferenceStorageKey("example.com")
    const changes = {
      [key]: { oldValue: undefined, newValue: false },
      [getSitePreferenceStorageKey("other.example")]: {
        oldValue: undefined,
        newValue: false,
      },
    }

    expect(getSiteEnabledFromChanges(changes, "example.com")).toBe(false)
    expect(getSiteEnabledFromChanges(changes, "unrelated.example")).toBeUndefined()
  })

  it("treats removal of a per-site override as enabled", () => {
    const key = getSitePreferenceStorageKey("example.com")
    expect(
      getSiteEnabledFromChanges(
        {
          [key]: { oldValue: false, newValue: undefined },
        },
        "example.com"
      )
    ).toBe(true)
  })

  it("continues to understand the legacy disabled-hosts value", () => {
    expect(
      getSiteEnabledFromChanges(
        {
          [SITE_PREFERENCES_STORAGE_KEY]: {
            oldValue: undefined,
            newValue: {
              schemaVersion: 1,
              disabledHosts: ["example.com"],
            },
          },
        },
        "example.com"
      )
    ).toBe(false)
  })
})

describe("per-site storage persistence", () => {
  it("defaults to enabled and stores only a disabled hostname", async () => {
    const host = "photos.example"
    const key = getSitePreferenceStorageKey(host)

    await expect(getSiteEnabled(host)).resolves.toBe(true)
    await expect(setSiteEnabled(host, false)).resolves.toBe(false)
    await expect(getSiteEnabled(host)).resolves.toBe(false)
    await expect(fakeBrowser.storage.local.get(key)).resolves.toEqual({ [key]: false })
  })

  it("stores an explicit enabled override when the user enables the site again", async () => {
    const host = "photos.example"
    const key = getSitePreferenceStorageKey(host)

    await fakeBrowser.storage.local.set({ [key]: false })
    await expect(setSiteEnabled(host, true)).resolves.toBe(true)
    await expect(getSiteEnabled(host)).resolves.toBe(true)
    await expect(fakeBrowser.storage.local.get(key)).resolves.toEqual({ [key]: true })
  })

  it("uses the direct site override ahead of a legacy disabled-hosts entry", async () => {
    const host = "photos.example"
    const key = getSitePreferenceStorageKey(host)

    await fakeBrowser.storage.local.set({
      [key]: true,
      [SITE_PREFERENCES_STORAGE_KEY]: {
        schemaVersion: 1,
        disabledHosts: [host],
      },
    })

    await expect(getSiteEnabled(host)).resolves.toBe(true)
  })
})
