// 配置常量
export const CONFIG = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_CONCURRENT: 3,
  DEBOUNCE_DELAY: 300,
  CONVERSION_QUALITY: 0.9,
  RETRY_ATTEMPTS: 2,
} as const

// 选择器
export const SELECTORS = {
  HEIC_IMAGES: 'img[src$=".HEIC"], img[src$=".heic"]',
  PROCESSING_CLASS: "heic-processing",
  ERROR_CLASS: "heic-error",
} as const

// 数据属性
export const DATA_ATTRIBUTES = {
  ORIGINAL_SRC: "data-original-src",
  PROCESSED: "data-heic-processed",
  ERROR_COUNT: "data-error-count",
} as const

// 错误消息
export const ERROR_MESSAGES = {
  FILE_TOO_LARGE: "图片文件过大，超过50MB限制",
  INVALID_FORMAT: "不是有效的HEIC格式文件",
  NETWORK_ERROR: "网络错误，无法获取图片",
  CONVERSION_FAILED: "HEIC转换失败",
  CORS_ERROR: "跨域访问被拒绝",
} as const
