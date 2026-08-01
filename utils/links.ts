export const OFFICIAL_SITE_URL = "https://vingeraycn.github.io/view-heic-browser-extension/"
export const WELCOME_URL = `${OFFICIAL_SITE_URL}?welcome=1&lang=en#how-it-works`
export const HELP_URL = `${OFFICIAL_SITE_URL}#how-it-works`
export const DEMO_URL = `${OFFICIAL_SITE_URL}#demo`
export const FAQ_URL = `${OFFICIAL_SITE_URL}#faq`
export function getLocalizedHelpUrl(language: "en" | "zh"): string {
  return `${OFFICIAL_SITE_URL}?lang=${language}#how-it-works`
}
export function getLocalizedFaqUrl(language: "en" | "zh"): string {
  return `${OFFICIAL_SITE_URL}?lang=${language}#faq`
}
export const STORE_REVIEW_URL =
  "https://chromewebstore.google.com/detail/view-heic/kpbcokcekojhfifjkbglcbaiffegecge/reviews"
export const ISSUE_URL = "https://github.com/vingeraycn/view-heic-browser-extension/issues/new"
