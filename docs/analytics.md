# View HEIC Analytics Specification and 1.1–1.3 Baseline Audit

Updated: 2026-08-14<br>
Analytics schema version: 2

## Conclusion

The legacy analytics implementation did send requests to the current GA4 property, but it is not suitable for product decisions. `heic_detected` and `conversion_failed` appeared in near one-to-one pairs because DOM observations and failure retries were recorded as business events. The client also embedded a Measurement Protocol API secret and used UUID `client_id` values that fail GA4's strict validation. The old protocol did not include version, product surface, or trigger dimensions, and the GA4 property had no custom definitions. It therefore cannot reliably explain what changed between releases 1.1, 1.2, and 1.3.

The goal for 1.4 is not to upload as much data as possible. Every event must have a clear product meaning, and collection must remain limited to the information required to answer a decision question.

## Historical Baseline

The following windows are split by release date. Because the legacy events did not include `extension_version`, they represent mixed traffic around each release rather than strict version cohorts.

| Observation window | GA4 users | `heic_detected` | `conversion_failed` | `conversion_success` | Supported conclusion |
| --- | ---: | ---: | ---: | ---: | --- |
| 1.1: 2026-07-06 to 07-11 | 105 | 204,249 | 204,164 | 69 | Event volume was already dominated by the failure loop. |
| 1.2: 2026-07-13 to 07-31 | 1,471 | 4,385,259 | 4,381,063 | 1,799 | The old protocol cannot isolate feature impact, and instrumentation noise increased substantially. |
| 1.3: 2026-08-02 to 08-13 | 63 | 564,850 | 564,815 | 45 | Reported users diverge sharply from the roughly 3,000 store users, so the result cannot be interpreted as real user loss. |

Over the latest 28-day period, GA4 recorded approximately 8.96 million events and 1,139 users. About 4.48 million detections and 4.48 million failures appeared in near one-to-one pairs, while only 1,485 successes were recorded. The review prompt was shown 25 times, dismissed 13 times, and accepted twice. This structure indicates that the legacy events measured internal attempts rather than completed user outcomes.

The 1.3 window contains only 63 reported users. The release build depended on local environment variables while the current store release had roughly 3,000 users, so the more plausible explanation is that analytics was disabled in the 1.3 production package and the remaining traffic came from users still running earlier versions. This data cannot determine whether the 1.3 popup, Gemini compatibility work, or stable failure states changed real activity.

## Core Metrics

| Metric | Definition | GA4 interpretation |
| --- | --- | --- |
| Daily active installations | Pseudonymous installations that perform at least one real extension activity during a local calendar day | Total users for `extension_active`; do not use the web-oriented global Active users card |
| Conversion workflows | Complete conversion attempts started by a page batch, file picker, drag-and-drop, or paste action | Event count for `conversion_completed` |
| Successful conversion installations | Installations that complete at least one successful or partially successful conversion | Total users for `conversion_completed`, filtered to `outcome in (success, partial)` |
| Conversion success rate | Successfully converted images divided by attempted images | `sum(success_count) / sum(attempted_count)` |
| Feature adoption | Active installations using an entry point divided by daily active installations | Total users split by `surface`, `trigger`, or event name |
| Version health | Active installations, success rate, error types, and P50/P95 duration for each version | Group by `extension_version` |

GA4 Sessions, Traffic acquisition, and global Active users use a website or app session model. Much of View HEIC runs in the background or in content scripts, and Measurement Protocol does not automatically add page attribution, ad-click, or browser-session context. Treat those cards as supporting information only. Version attribution must use the explicit `extension_version` parameter.

## Event Contract

Every event includes:

- `extension_version`: the extension version, such as `1.4.0`
- `analytics_schema_version`: currently `2`
- `session_id`: a numeric session identifier renewed after 30 minutes of inactivity

Each request also includes `timestamp_micros`, the event occurrence time captured before background queueing. Queued events expire after five minutes so delayed work cannot change a later activity day or session.

| Event | Trigger | Product parameters |
| --- | --- | --- |
| `extension_active` | Attached once to the first successfully reported user- or conversion-driven event on each local calendar day; install and automatic-update events are excluded | `activity_source`, `engagement_time_msec=1` |
| `extension_installed` | First installation | None |
| `extension_updated` | Extension update | Optional `previous_version` |
| `popup_opened` | Popup state resolution completes | `connection_state`, `page_phase`, `site_enabled` |
| `site_preference_changed` | A per-site preference is persisted successfully | `enabled` |
| `help_opened` | The user opens help or the FAQ | `surface` |
| `file_converter_opened` | The standalone file converter opens | None |
| `conversion_completed` | A real conversion workflow ends with success, partial success, or failure | `surface`, `trigger`, `outcome`, `attempted_count`, `success_count`, `failure_count`, `duration_ms` capped at 24 hours, optional `error_type` |
| `file_downloaded` | The user downloads a converted result | None |
| `review_prompt_shown` | The review prompt is actually displayed | `success_total` |
| `review_prompt_action` | The user reviews, sends feedback, or dismisses the prompt | `action`, `success_total`, `failure_total` |

Never collect image contents, source-image or page URLs, hostnames, file names, page titles, browsing history, search terms, form contents, user-authored text, account or device identifiers, or precise location.

## GA4 Custom Definitions

Event-scoped custom dimensions:

- `extension_version`
- `analytics_schema_version`
- `previous_version`
- `surface`
- `trigger`
- `outcome`
- `error_type`
- `activity_source`
- `connection_state`
- `page_phase`
- `action`
- `enabled`
- `site_enabled`

Event-scoped custom metrics:

- `attempted_count`
- `success_count`
- `failure_count`
- `duration_ms`
- `success_total`
- `failure_total`

Custom definitions take effect from their creation time and do not backfill historical data. Create a Version health exploration with `extension_version` as rows, `surface` and `outcome` as columns, and active installations, conversion workflows, success rate, and duration percentiles as values. After release, inspect event validity for 24 hours, compare the same weekday structure over seven days, and collect at least 14 days before judging a version-level trend.

## Transport and Privacy Boundary

The extension sends allowlisted events only to the first-party proxy configured by `WXT_ANALYTICS_ENDPOINT`. The proxy validates the published extension Origin, Cloudflare-provided connection metadata, event age, request size, GA client identifier format, event names, parameter names, and parameter values before forwarding the request to GA4 with a server-side secret. The Origin header is not treated as authentication: a Cloudflare Rate Limiting binding applies a generous per-address abuse limit before the body is processed. The connection address is not added to the analytics payload. The extension package must never contain the Measurement ID or API secret.

Data sharing is enabled by default to preserve the established product behavior, while the popup provides a persistent and visible opt-out. Disabling analytics does not cache or replay events and deletes the local pseudonymous installation identifier, session, and daily-active state. Re-enabling analytics creates a new identifier that cannot be linked to data collected before opt-out.
