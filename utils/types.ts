export interface ConversionOptions {
  quality?: number
  format?: "png" | "jpeg"
  maxRetries?: number
}

export interface ConversionResult {
  success: boolean
  blob?: Blob
  error?: ConversionError
}

export interface ConversionError {
  type: "network" | "cors" | "size" | "format" | "conversion" | "unknown"
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
