# View HEIC analytics edge proxy

This small Cloudflare Worker is the only component that knows the Google Analytics Measurement Protocol secret. The browser extension sends a narrow, allowlisted event contract to this endpoint; the worker rejects unknown events, parameters, stale timestamps, origins, rate-limited clients, and oversized requests before forwarding valid payloads to GA4.

Deployment configuration:

- `GA_MEASUREMENT_ID`: secret containing the GA4 web stream measurement ID.
- `GA_API_SECRET`: secret containing a newly created Measurement Protocol API secret.
- `ALLOWED_EXTENSION_ORIGIN`: the published Chrome extension origin (already set in `wrangler.jsonc`).
- `ANALYTICS_RATE_LIMITER`: the Cloudflare Rate Limiting binding declared in `wrangler.jsonc`; it uses Cloudflare-provided connection metadata and is not part of the analytics payload.

The Origin header narrows browser access but is not an authentication credential. The server-side rate limiter and strict payload contract provide abuse controls without embedding another reusable secret in the open-source extension. Do not put either GA value in the extension environment or bundle.
