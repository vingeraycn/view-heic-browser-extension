# View HEIC analytics edge proxy

This small Cloudflare Worker is the only component that knows the Google Analytics Measurement Protocol secret. The browser extension sends a narrow, allowlisted event contract to this endpoint; the worker rejects unknown events, parameters, origins, and oversized requests before forwarding valid payloads to GA4.

Deployment configuration:

- `GA_MEASUREMENT_ID`: secret containing the GA4 web stream measurement ID.
- `GA_API_SECRET`: secret containing a newly created Measurement Protocol API secret.
- `ALLOWED_EXTENSION_ORIGIN`: the published Chrome extension origin (already set in `wrangler.jsonc`).

Configure a Cloudflare rate-limiting rule for `POST /` before enabling the production extension build. Do not put either GA value in the extension environment or bundle.
