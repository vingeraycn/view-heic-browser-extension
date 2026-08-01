import { convertHeifFileDirectly } from "../utils/direct-heif-converter"
import {
  registerGeminiDecoderService,
  unregisterGeminiDecoderService,
  type GeminiDecoderService,
} from "../utils/gemini-decoder-registry"
import { SerialTaskQueue } from "../utils/serial-task-queue"

export default defineContentScript({
  matches: ["https://gemini.google.com/*"],
  runAt: "document_start",
  main(ctx) {
    const decodeQueue = new SerialTaskQueue()
    const service: GeminiDecoderService = {
      convert: (file) => decodeQueue.run(() => convertHeifFileDirectly(file)),
    }
    registerGeminiDecoderService(service)
    ctx.onInvalidated(() => unregisterGeminiDecoderService(service))
  },
})
