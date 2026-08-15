import { describe, expect, it, vi } from "vitest"
import { createShowOpenFilePickerInterceptor } from "../../utils/file-system-picker-interception"

describe("File System Access picker interception", () => {
  it("converts files returned by getFile while preserving the native handle", async () => {
    const createHandle = createHandleFactory()
    const originalFile = { name: "photo.heic" }
    const convertedFile = { name: "photo.jpg" }
    const handle = createHandle(originalFile)
    const interceptFile = vi.fn(async () => convertedFile)
    const showOpenFilePicker = createShowOpenFilePickerInterceptor(
      vi.fn(async () => [handle]),
      { isEnabled: () => true, interceptFile }
    )

    const [returnedHandle] = (await showOpenFilePicker()) as Array<typeof handle>

    expect(returnedHandle).toBe(handle)
    await expect(returnedHandle.getFile()).resolves.toBe(convertedFile)
    expect(interceptFile).toHaveBeenCalledWith(originalFile)
  })

  it("keeps returned handles structurally cloneable", async () => {
    const createHandle = createHandleFactory()
    const handle = createHandle({ name: "photo.heic" })
    const showOpenFilePicker = createShowOpenFilePickerInterceptor(
      vi.fn(async () => [handle]),
      { isEnabled: () => true, interceptFile: async (file) => file }
    )

    const [returnedHandle] = (await showOpenFilePicker()) as Array<typeof handle>

    expect(returnedHandle).toBe(handle)
    expect(() => structuredClone(returnedHandle)).not.toThrow()
  })

  it("returns the original file without conversion when interception is disabled", async () => {
    const createHandle = createHandleFactory()
    const originalFile = { name: "photo.heic" }
    const handle = createHandle(originalFile)
    const interceptFile = vi.fn()
    const showOpenFilePicker = createShowOpenFilePickerInterceptor(
      vi.fn(async () => [handle]),
      { isEnabled: () => false, interceptFile }
    )

    const [returnedHandle] = (await showOpenFilePicker()) as Array<typeof handle>

    expect(returnedHandle).toBe(handle)
    await expect(returnedHandle.getFile()).resolves.toBe(originalFile)
    expect(interceptFile).not.toHaveBeenCalled()
  })

  it("falls back to the original file when conversion fails", async () => {
    const createHandle = createHandleFactory()
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

    const [returnedHandle] = (await showOpenFilePicker()) as Array<typeof handle>

    await expect(returnedHandle.getFile()).resolves.toBe(originalFile)
  })

  it("does not intercept handles outside the picker result", async () => {
    const createHandle = createHandleFactory()
    const selectedFile = { name: "selected.heic" }
    const unrelatedFile = { name: "unrelated.heic" }
    const selectedHandle = createHandle(selectedFile)
    const unrelatedHandle = createHandle(unrelatedFile)
    const interceptFile = vi.fn(async () => ({ name: "selected.jpg" }))
    const showOpenFilePicker = createShowOpenFilePickerInterceptor(
      vi.fn(async () => [selectedHandle]),
      { isEnabled: () => true, interceptFile }
    )

    await showOpenFilePicker()

    await expect(unrelatedHandle.getFile()).resolves.toBe(unrelatedFile)
    expect(interceptFile).not.toHaveBeenCalled()
  })

  it("preserves native handle identity behavior for other methods", async () => {
    const createHandle = createHandleFactory()
    const firstHandle = createHandle({ name: "first.heic" })
    const secondHandle = createHandle({ name: "second.heic" })
    const showOpenFilePicker = createShowOpenFilePickerInterceptor(
      vi.fn(async () => [firstHandle, secondHandle]),
      { isEnabled: () => true, interceptFile: async (file) => file }
    )

    const [firstReturned, secondReturned] = (await showOpenFilePicker()) as Array<
      typeof firstHandle
    >

    expect(firstReturned).toBe(firstHandle)
    expect(secondReturned).toBe(secondHandle)
    expect(firstReturned.kind).toBe("file")
    expect(firstReturned.name).toBe("photo.heic")
    expect(firstReturned.isSameEntry(firstReturned)).toBe(true)
    expect(firstReturned.isSameEntry(secondReturned)).toBe(false)
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

function createHandleFactory() {
  class TestFileSystemFileHandle {
    readonly kind = "file"
    readonly name = "photo.heic"

    constructor(private readonly file: { name: string }) {}

    async getFile() {
      return this.file
    }

    isSameEntry(other: unknown) {
      return other === this
    }
  }

  return (file: { name: string }) => new TestFileSystemFileHandle(file)
}
