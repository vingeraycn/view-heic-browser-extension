import { convertHeifFileDirectly } from "../utils/direct-heif-converter"
import {
  registerGeminiDecoderService,
  unregisterGeminiDecoderService,
  type GeminiDecoderService,
} from "../utils/gemini-decoder-registry"
import { SerialTaskQueue } from "../utils/serial-task-queue"

// Intentionally keep the decoder in the extension isolated world, where content.ts
// consumes the registry. The MAIN-world interceptor only forwards page DOM events.
export default defineContentScript({
  matches: ["https://gemini.google.com/*"],
  runAt: "document_start",
  world: "ISOLATED",
  main(ctx) {
    const decodeQueue = new SerialTaskQueue()
    const service: GeminiDecoderService = {
      convert: (file) => decodeQueue.run(() => convertHeifFileDirectly(file)),
    }
    registerGeminiDecoderService(service)
    ctx.onInvalidated(() => unregisterGeminiDecoderService(service))
  },
})
