import { describe, expect, it, vi } from "vitest"
import { createUploadHeifConverter } from "../../utils/upload-heif-converter"

const sourceFile = { name: "photo.heic" } as File
const workerFile = { name: "worker.jpg" } as File
const directFile = { name: "direct.jpg" } as File

describe("createUploadHeifConverter", () => {
  it("keeps the existing worker path on ordinary pages", async () => {
    const worker = vi.fn(async () => workerFile)
    const getDirectDecoder = vi.fn(() => vi.fn(async () => directFile))
    const convert = createUploadHeifConverter(
      { worker, getDirectDecoder },
      { requiresDirectDecoder: () => false }
    )

    await expect(convert(sourceFile)).resolves.toBe(workerFile)
    expect(worker).toHaveBeenCalledOnce()
    expect(getDirectDecoder).not.toHaveBeenCalled()
  })

  it("uses the separately registered decoder on Gemini", async () => {
    const worker = vi.fn(async () => workerFile)
    const direct = vi.fn(async () => directFile)
    const convert = createUploadHeifConverter(
      { worker, getDirectDecoder: () => direct },
      { requiresDirectDecoder: () => true }
    )

    await expect(convert(sourceFile)).resolves.toBe(directFile)
    expect(worker).not.toHaveBeenCalled()
    expect(direct).toHaveBeenCalledOnce()
  })

  it("fails closed when Gemini's decoder content script is unavailable", async () => {
    const worker = vi.fn(async () => workerFile)
    const convert = createUploadHeifConverter(
      { worker, getDirectDecoder: () => undefined },
      { requiresDirectDecoder: () => true }
    )

    await expect(convert(sourceFile)).rejects.toThrow("Gemini HEIC decoder is unavailable")
    expect(worker).not.toHaveBeenCalled()
  })

  it("does not redirect an ordinary Worker crash into the page main thread", async () => {
    const decodeError = new Error("decoder crashed")
    const worker = vi.fn<(file: File) => Promise<File>>().mockRejectedValue(decodeError)
    const direct = vi.fn(async () => directFile)
    const convert = createUploadHeifConverter(
      { worker, getDirectDecoder: () => direct },
      { requiresDirectDecoder: () => false }
    )

    await expect(convert(sourceFile)).rejects.toBe(decodeError)
    expect(direct).not.toHaveBeenCalled()
  })
})
