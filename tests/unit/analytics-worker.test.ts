import { describe, expect, it, vi } from "vitest"
import { handleAnalyticsRequest } from "../../analytics-worker/src/index"

const extensionOrigin = "chrome-extension://kpbcokcekojhfifjkbglcbaiffegecge"
const env = {
  ALLOWED_EXTENSION_ORIGIN: extensionOrigin,
  ANALYTICS_RATE_LIMITER: {
    limit: vi.fn(async () => ({ success: true })),
  },
  GA_MEASUREMENT_ID: "G-TEST123456",
  GA_API_SECRET: "test-secret",
}

describe("analytics edge proxy", () => {
  it("forwards a valid allowlisted payload without exposing the secret to the client", async () => {
    const forwardMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 204 })
    )
    const forward = forwardMock as unknown as typeof fetch
    const response = await handleAnalyticsRequest(
      createRequest({
        client_id: "123456789.1786716000",
        timestamp_micros: Date.now() * 1000,
        events: [
          {
            name: "conversion_completed",
            params: {
              analytics_schema_version: "2",
              extension_version: "1.4.0",
              session_id: 1_786_716_000,
              surface: "file_converter",
              trigger: "file_picker",
              outcome: "success",
              attempted_count: 1,
              success_count: 1,
              failure_count: 0,
              duration_ms: 96,
            },
          },
        ],
      }),
      env,
      forward
    )

    expect(response.status).toBe(204)
    expect(await response.text()).toBe("")
    expect(forwardMock).toHaveBeenCalledOnce()
    const [upstreamUrl] = forwardMock.mock.calls[0]
    expect(String(upstreamUrl)).toContain("measurement_id=G-TEST123456")
    expect(String(upstreamUrl)).toContain("api_secret=test-secret")
  })

  it("rejects requests from any origin other than the published extension", async () => {
    const request = createRequest(validPayload(), "https://example.com")

    await expect(handleAnalyticsRequest(request, env)).resolves.toMatchObject({ status: 403 })
  })

  it("rejects requests without Cloudflare-provided client metadata", async () => {
    const request = new Request("https://analytics.example.workers.dev", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: extensionOrigin,
      },
      body: JSON.stringify(validPayload()),
    })

    await expect(handleAnalyticsRequest(request, env)).resolves.toMatchObject({ status: 403 })
  })

  it("stops requests rejected by the server-side rate limiter", async () => {
    const limitedEnv = {
      ...env,
      ANALYTICS_RATE_LIMITER: {
        limit: vi.fn(async () => ({ success: false })),
      },
    }
    const forward = vi.fn(async () => new Response(null, { status: 204 }))

    await expect(
      handleAnalyticsRequest(
        createRequest(validPayload()),
        limitedEnv,
        forward as unknown as typeof fetch
      )
    ).resolves.toMatchObject({ status: 429 })
    expect(forward).not.toHaveBeenCalled()
  })

  it("rejects stale or implausibly future event timestamps", async () => {
    const stale = validPayload()
    stale.timestamp_micros = (Date.now() - 6 * 60 * 1000) * 1000
    const future = validPayload()
    future.timestamp_micros = (Date.now() + 60 * 1000) * 1000

    await expect(handleAnalyticsRequest(createRequest(stale), env)).resolves.toMatchObject({
      status: 400,
    })
    await expect(handleAnalyticsRequest(createRequest(future), env)).resolves.toMatchObject({
      status: 400,
    })
  })

  it("rejects the legacy UUID client ID", async () => {
    const payload = validPayload()
    payload.client_id = "97074dde-18b4-4ad2-8aed-7676d2ed46ac"

    await expect(handleAnalyticsRequest(createRequest(payload), env)).resolves.toMatchObject({
      status: 400,
    })
  })

  it("rejects unknown events and privacy-sensitive parameters", async () => {
    const unknownEvent = validPayload()
    unknownEvent.events[0].name = "page_view"
    await expect(
      handleAnalyticsRequest(createRequest(unknownEvent), env)
    ).resolves.toMatchObject({ status: 400 })

    const sensitiveParam = validPayload()
    sensitiveParam.events[0].params.url = "https://private.example/photo.heic"
    await expect(
      handleAnalyticsRequest(createRequest(sensitiveParam), env)
    ).resolves.toMatchObject({ status: 400 })
  })

  it.each(["constructor", "toString", "__proto__"])(
    "rejects inherited event name %s without throwing",
    async (eventName) => {
      const payload = validPayload()
      payload.events[0].name = eventName

      await expect(handleAnalyticsRequest(createRequest(payload), env)).resolves.toMatchObject({
        status: 400,
      })
    }
  )

  it("rejects inconsistent conversion counts and outcomes", async () => {
    const payload = validConversionPayload()
    payload.events[0].params.success_count = 2
    payload.events[0].params.outcome = "failure"

    await expect(handleAnalyticsRequest(createRequest(payload), env)).resolves.toMatchObject({
      status: 400,
    })
  })

  it("accepts completed conversions that take longer than ten minutes", async () => {
    const payload = validConversionPayload()
    payload.events[0].params.duration_ms = 700_000
    const forward = vi.fn(async () => new Response(null, { status: 204 }))

    await expect(
      handleAnalyticsRequest(createRequest(payload), env, forward as unknown as typeof fetch)
    ).resolves.toMatchObject({ status: 204 })
  })

  it.each([
    ["conversion-only surface", "popup", "file_picker"],
    ["surface and trigger combination", "web_upload", "mutation"],
  ])("rejects an invalid %s", async (_name, surface, trigger) => {
    const payload = validConversionPayload()
    payload.events[0].params.surface = surface
    payload.events[0].params.trigger = trigger
    const forward = vi.fn(async () => new Response(null, { status: 204 }))

    await expect(
      handleAnalyticsRequest(createRequest(payload), env, forward as unknown as typeof fetch)
    ).resolves.toMatchObject({ status: 400 })
    expect(forward).not.toHaveBeenCalled()
  })

  it("rejects a help surface outside the client contract", async () => {
    const payload = validPayload()
    payload.events = [
      {
        name: "help_opened",
        params: {
          ...commonParams(),
          surface: "page_image",
        },
      },
    ]
    const forward = vi.fn(async () => new Response(null, { status: 204 }))

    await expect(
      handleAnalyticsRequest(createRequest(payload), env, forward as unknown as typeof fetch)
    ).resolves.toMatchObject({ status: 400 })
    expect(forward).not.toHaveBeenCalled()
  })

  it("stops reading oversized request bodies before parsing or forwarding", async () => {
    const forward = vi.fn(async () => new Response(null, { status: 204 }))
    const request = new Request("https://analytics.example.workers.dev", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.7",
        Origin: extensionOrigin,
      },
      body: "x".repeat(20_000),
    })
    expect(request.headers.get("Content-Length")).toBeNull()

    await expect(
      handleAnalyticsRequest(request, env, forward as unknown as typeof fetch)
    ).resolves.toMatchObject({ status: 413 })
    expect(forward).not.toHaveBeenCalled()
  })

  it("rejects lifecycle events as daily activity sources", async () => {
    const payload = validPayload()
    payload.events.push({
      name: "extension_active",
      params: {
        analytics_schema_version: "2",
        extension_version: "1.4.0",
        session_id: 1_786_716_000,
        activity_source: "extension_updated",
        engagement_time_msec: 1,
      },
    })

    await expect(handleAnalyticsRequest(createRequest(payload), env)).resolves.toMatchObject({
      status: 400,
    })
  })

  it.each([
    ["standalone activity", [validActiveEvent("popup")]],
    ["duplicate activity", [validActiveEvent("popup"), validActiveEvent("popup")]],
    [
      "lifecycle event paired with activity",
      [
        {
          name: "extension_updated",
          params: commonParams(),
        },
        validActiveEvent("popup"),
      ],
    ],
    [
      "mismatched activity source",
      [validPayload().events[0], validActiveEvent("help")],
    ],
  ])("rejects %s batches", async (_name, events) => {
    const payload = validPayload()
    payload.events = events
    const forward = vi.fn(async () => new Response(null, { status: 204 }))

    await expect(
      handleAnalyticsRequest(createRequest(payload), env, forward as unknown as typeof fetch)
    ).resolves.toMatchObject({ status: 400 })
    expect(forward).not.toHaveBeenCalled()
  })

  it("accepts one matching daily activity event after a user-driven event", async () => {
    const payload = validPayload()
    payload.events.push(validActiveEvent("popup"))
    const forward = vi.fn(async () => new Response(null, { status: 204 }))

    await expect(
      handleAnalyticsRequest(createRequest(payload), env, forward as unknown as typeof fetch)
    ).resolves.toMatchObject({ status: 204 })
    expect(forward).toHaveBeenCalledOnce()
  })
})

function createRequest(payload: unknown, origin = extensionOrigin): Request {
  return new Request("https://analytics.example.workers.dev", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.7",
      Origin: origin,
    },
    body: JSON.stringify(payload),
  })
}

function validPayload() {
  return {
    client_id: "123456789.1786716000",
    timestamp_micros: Date.now() * 1000,
    events: [
      {
        name: "popup_opened",
        params: {
          analytics_schema_version: "2",
          extension_version: "1.4.0",
          session_id: 1_786_716_000,
          connection_state: "connected",
          page_phase: "idle",
          site_enabled: true,
        } as Record<string, unknown>,
      },
    ],
  }
}

function commonParams() {
  return {
    analytics_schema_version: "2",
    extension_version: "1.4.0",
    session_id: 1_786_716_000,
  }
}

function validActiveEvent(activitySource: string) {
  return {
    name: "extension_active",
    params: {
      ...commonParams(),
      activity_source: activitySource,
      engagement_time_msec: 1,
    } as Record<string, unknown>,
  }
}

function validConversionPayload() {
  return {
    client_id: "123456789.1786716000",
    timestamp_micros: Date.now() * 1000,
    events: [
      {
        name: "conversion_completed",
        params: {
          analytics_schema_version: "2",
          extension_version: "1.4.0",
          session_id: 1_786_716_000,
          surface: "file_converter",
          trigger: "file_picker",
          outcome: "success",
          attempted_count: 1,
          success_count: 1,
          failure_count: 0,
          duration_ms: 96,
        } as Record<string, unknown>,
      },
    ],
  }
}
