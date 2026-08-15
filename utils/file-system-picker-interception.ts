export type ShowOpenFilePicker = (options?: unknown) => Promise<unknown>

interface FileSystemPickerInterceptionOptions {
  isEnabled: () => boolean
  interceptFile: (file: unknown) => Promise<unknown>
}

export function createShowOpenFilePickerInterceptor(
  showOpenFilePicker: ShowOpenFilePicker,
  options: FileSystemPickerInterceptionOptions
): ShowOpenFilePicker {
  const wrappedHandles = new WeakMap<object, object>()
  const originalHandles = new WeakMap<object, object>()

  const wrapHandle = (handle: unknown): unknown => {
    if (!isFileSystemFileHandle(handle)) return handle

    const cached = wrappedHandles.get(handle)
    if (cached) return cached

    const boundMethods = new Map<PropertyKey, (...args: unknown[]) => unknown>()
    const interceptedGetFile = async (): Promise<unknown> => {
      const getFile = Reflect.get(handle, "getFile", handle)
      const file = await Reflect.apply(getFile, handle, [])
      if (!options.isEnabled()) return file

      try {
        return await options.interceptFile(file)
      } catch {
        return file
      }
    }

    const proxy = new Proxy(handle, {
      get(target, property) {
        if (property === "getFile") return interceptedGetFile

        const value = Reflect.get(target, property, target)
        if (typeof value !== "function") return value

        const cachedMethod = boundMethods.get(property)
        if (cachedMethod) return cachedMethod

        const boundMethod = (...args: unknown[]): unknown =>
          Reflect.apply(value, target, args.map(unwrapHandle))
        boundMethods.set(property, boundMethod)
        return boundMethod
      },
    })

    wrappedHandles.set(handle, proxy)
    originalHandles.set(proxy, handle)
    return proxy
  }

  const unwrapHandle = (value: unknown): unknown => {
    if (typeof value !== "object" || value === null) return value
    return originalHandles.get(value) ?? value
  }

  return new Proxy(showOpenFilePicker, {
    async apply(target, thisArg, args): Promise<unknown> {
      const handles = await Reflect.apply(target, thisArg, args)
      return Array.isArray(handles) ? handles.map(wrapHandle) : handles
    },
  })
}

function isFileSystemFileHandle(value: unknown): value is object {
  return (
    typeof value === "object" &&
    value !== null &&
    Reflect.get(value, "kind") === "file" &&
    typeof Reflect.get(value, "getFile") === "function"
  )
}
