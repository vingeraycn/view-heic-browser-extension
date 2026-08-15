import { describe, expect, it, vi } from "vitest"
import { createShowOpenFilePickerInterceptor } from "../../utils/file-system-picker-interception"

describe("File System Access picker interception", () => {
  it("converts files returned by getFile when interception is enabled", async () => {
    const originalFile = { name: "photo.heic" }
    const convertedFile = { name: "photo.jpg" }
    const handle = createHandle(originalFile)
    const interceptFile = vi.fn(async () => convertedFile)
    const showOpenFilePicker = createShowOpenFilePickerInterceptor(
      vi.fn(async () => [handle]),
      { isEnabled: () => true, interceptFile }
    )

    const [wrappedHandle] = (await showOpenFilePicker()) as Array<typeof handle>

    await expect(wrappedHandle.getFile()).resolves.toBe(convertedFile)
    expect(interceptFile).toHaveBeenCalledWith(originalFile)
  })

  it("returns the original file without conversion when interception is disabled", async () => {
    const originalFile = { name: "photo.heic" }
    const handle = createHandle(originalFile)
    const interceptFile = vi.fn()
    const showOpenFilePicker = createShowOpenFilePickerInterceptor(
      vi.fn(async () => [handle]),
      { isEnabled: () => false, interceptFile }
    )

    const [wrappedHandle] = (await showOpenFilePicker()) as Array<typeof handle>

    await expect(wrappedHandle.getFile()).resolves.toBe(originalFile)
    expect(interceptFile).not.toHaveBeenCalled()
  })

  it("falls back to the original file when conversion fails", async () => {
    const originalFile = { name: "photo.heic" }
    const handle = createHandle(originalFile)
    const showOpenFilePicker = createShowOpenFilePickerInterceptor(
      vi.fn(async () => [handle]),
      {
        isEnabled: () => true,
        interceptFile: vi.fn(async () => {
          throw new Error("conversion failed")
        }),
      }
    )

    const [wrappedHandle] = (await showOpenFilePicker()) as Array<typeof handle>

    await expect(wrappedHandle.getFile()).resolves.toBe(originalFile)
  })

  it("preserves native handle identity behavior for other methods", async () => {
    const firstHandle = createHandle({ name: "first.heic" })
    const secondHandle = createHandle({ name: "second.heic" })
    const showOpenFilePicker = createShowOpenFilePickerInterceptor(
      vi.fn(async () => [firstHandle, secondHandle]),
      { isEnabled: () => true, interceptFile: async (file) => file }
    )

    const [firstWrapped, secondWrapped] = (await showOpenFilePicker()) as Array<
      typeof firstHandle
    >

    expect(firstWrapped.kind).toBe("file")
    expect(firstWrapped.name).toBe("photo.heic")
    expect(firstWrapped.isSameEntry).toBe(firstWrapped.isSameEntry)
    expect(firstWrapped.isSameEntry(firstWrapped)).toBe(true)
    expect(firstWrapped.isSameEntry(secondWrapped)).toBe(false)
  })

  it("preserves picker cancellation", async () => {
    const cancellation = new DOMException("The user aborted a request", "AbortError")
    const showOpenFilePicker = createShowOpenFilePickerInterceptor(
      vi.fn(async () => {
        throw cancellation
      }),
      { isEnabled: () => true, interceptFile: async (file) => file }
    )

    await expect(showOpenFilePicker()).rejects.toBe(cancellation)
  })
})

function createHandle(file: { name: string }) {
  const handle = {
    kind: "file",
    name: "photo.heic",
    async getFile() {
      return file
    },
    isSameEntry(other: unknown) {
      return other === handle
    },
  }
  return handle
}
