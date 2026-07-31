import { describe, expect, it, vi } from "vitest"
import { HEICConverter } from "../../utils/heic-converter"

describe("HEICConverter cancellation", () => {
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
