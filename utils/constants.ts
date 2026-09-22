// Configuration constants
export const CONFIG = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_IMAGE_DIMENSION: 16_384,
  // Keeps current 48 MP phone photos valid while bounding RGBA/canvas memory.
  MAX_IMAGE_PIXELS: 50 * 1024 * 1024,
  MAX_CONCURRENT: 3,
  DEBOUNCE_DELAY: 300,
  CONVERSION_QUALITY: 0.9,
  RETRY_ATTEMPTS: 2,
  ANIMATED_HEIC_PLAYBACK_ENABLED: false,
  /** Target frame rate for animated HEIC sequence playback (frames per second). */
  ANIMATION_FPS: 24,
} as const

// Selectors
export const SELECTORS = {
  IMAGE_CANDIDATES: "img[src]",
  PROCESSING_CLASS: "heic-processing",
  ERROR_CLASS: "heic-error",
} as const

// Data attributes
export const DATA_ATTRIBUTES = {
  ORIGINAL_SRC: "data-original-src",
  PROCESSED: "data-heic-processed",
  FAILED: "data-heic-failed",
  ERROR_COUNT: "data-error-count",
  PREVIOUS_FILTER: "data-heic-previous-filter",
  PREVIOUS_CURSOR: "data-heic-previous-cursor",
  PREVIOUS_TITLE: "data-heic-previous-title",
} as const

// Error messages
export const ERROR_MESSAGES = {
  FILE_TOO_LARGE: "Image exceeds the 50MB size limit",
  INVALID_FORMAT: "Invalid HEIC file format",
  UNSUPPORTED_CODEC: "HEIF container uses an unsupported codec",
  NETWORK_ERROR: "Network error: could not fetch image",
  CONVERSION_FAILED: "HEIC conversion failed",
  CORS_ERROR: "Cross-origin access denied",
} as const
