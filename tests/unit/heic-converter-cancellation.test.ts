import { describe, expect, it, vi } from "vitest"
import { HEICConverter } from "../../utils/heic-converter"

describe("HEICConverter cancellation", () => {
  it("distinguishes its own converted source from a later site source change", () => {
    const converter = new HEICConverter()
    const image = {
      src: "blob:https://example.com/converted",
      removeAttribute: vi.fn(),
      setAttribute: vi.fn(),
    } as unknown as HTMLImageElement
    const markImageAsProcessed = (
      converter as unknown as { markImageAsProcessed: (img: HTMLImageElement) => void }
    ).markImageAsProcessed.bind(converter)

    markImageAsProcessed(image)
    expect(converter.isCurrentConversionResult(image)).toBe(true)

    image.src = "https://example.com/replacement.jpg"
    expect(converter.isCurrentConversionResult(image)).toBe(false)
  })

  it("settles stale work without retrying or leaving the loading class", async () => {
    const converter = new HEICConverter()
    const attributes = new Map<string, string>()
    const classes = new Set<string>()
    const image = {
      src: "https://example.com/original.heic",
      classList: {
        add: (...names: string[]) => names.forEach((name) => classes.add(name)),
        remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
      },
      hasAttribute: (name: string) => attributes.has(name),
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
    } as unknown as HTMLImageElement
    let rejectFetch: ((error: Error) => void) | undefined
    const fetchImageData = vi
      .spyOn(
        converter as unknown as { fetchImageData: () => Promise<ArrayBuffer> },
        "fetchImageData"
      )
      .mockImplementation(
        () => new Promise<ArrayBuffer>((_resolve, reject) => {
          rejectFetch = reject
        })
      )

    const conversion = converter.convertImage(image, { maxRetries: 2 })
    expect(classes.has("heic-processing")).toBe(true)

    image.src = "https://example.com/replacement.jpg"
    rejectFetch?.(new Error("temporary network failure"))

    await expect(conversion).resolves.toEqual({ success: false, cancelled: true })
    expect(fetchImageData).toHaveBeenCalledTimes(1)
    expect(classes.has("heic-processing")).toBe(false)
  })

  it("does not start another batch after the caller aborts", async () => {
    const converter = new HEICConverter()
    const controller = new AbortController()
    let releaseBatch: (() => void) | undefined
    const batchGate = new Promise<void>((resolve) => {
      releaseBatch = resolve
    })
    const convertImage = vi
      .spyOn(converter, "convertImage")
      .mockImplementation(async () => {
        await batchGate
        return { success: false }
      })
    const images = Array.from({ length: 6 }, () => ({}) as HTMLImageElement)

    const conversion = converter.convertAllImages(images, { signal: controller.signal })
    await Promise.resolve()
    expect(convertImage).toHaveBeenCalledTimes(3)

    controller.abort()
    releaseBatch?.()
    const results = await conversion

    expect(results).toHaveLength(3)
    expect(convertImage).toHaveBeenCalledTimes(3)
  })

  it("does not start any work when the signal is already aborted", async () => {
    const converter = new HEICConverter()
    const controller = new AbortController()
    controller.abort()
    const convertImage = vi.spyOn(converter, "convertImage")

    await expect(
      converter.convertAllImages([{} as HTMLImageElement], { signal: controller.signal })
    ).resolves.toEqual([])
    expect(convertImage).not.toHaveBeenCalled()
  })

  it("keeps a replacement task in the queue when an aborted task settles later", async () => {
    const converter = new HEICConverter()
    const image = {
      hasAttribute: () => false,
      classList: { remove: vi.fn() },
    } as unknown as HTMLImageElement
    let releaseFirst: (() => void) | undefined
    let releaseSecond: (() => void) | undefined
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve
    })
    const doConvert = vi
      .spyOn(converter as unknown as { _doConvert: () => Promise<{ success: boolean }> }, "_doConvert")
      .mockImplementationOnce(async () => {
        await firstGate
        return { success: false }
      })
      .mockImplementationOnce(async () => {
        await secondGate
        return { success: true }
      })

    const firstTask = converter.convertImage(image)
    converter.cancelPendingConversions()
    const replacementTask = converter.convertImage(image)

    releaseFirst?.()
    await firstTask
    const deduplicatedTask = converter.convertImage(image)
    expect(doConvert).toHaveBeenCalledTimes(2)

    releaseSecond?.()
    await expect(Promise.all([replacementTask, deduplicatedTask])).resolves.toEqual([
      { success: true },
      { success: true },
    ])
  })
})
