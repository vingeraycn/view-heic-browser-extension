export interface ConversionOptions {
  quality?: number
  format?: "png" | "jpeg"
  maxRetries?: number
  ignoreInvalidFormat?: boolean
  signal?: AbortSignal
}

export interface ConversionResult {
  success: boolean
  cancelled?: boolean
  blob?: Blob
  error?: ConversionError
}

export interface ConversionError {
  type: "network" | "cors" | "size" | "format" | "unsupported" | "conversion" | "unknown"
  message: string
  originalError?: any
}

export interface ProcessingState {
  processed: WeakSet<HTMLImageElement>
  processing: Map<HTMLImageElement, Promise<void>>
  observer?: MutationObserver
}

export interface ImageMetadata {
  originalSrc: string
  size?: number
  format?: string
  processedAt?: Date
}
