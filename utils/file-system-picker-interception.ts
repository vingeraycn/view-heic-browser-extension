export type ShowOpenFilePicker = (options?: unknown) => Promise<unknown>

interface FileSystemPickerInterceptionOptions {
  isEnabled: () => boolean
  interceptFile: (file: unknown) => Promise<unknown>
}

const registeredHandleOptions = new WeakMap<object, FileSystemPickerInterceptionOptions>()
const patchedGetFileOwners = new WeakSet<object>()

export function createShowOpenFilePickerInterceptor(
  showOpenFilePicker: ShowOpenFilePicker,
  options: FileSystemPickerInterceptionOptions
): ShowOpenFilePicker {
  const registerHandle = (handle: unknown): void => {
    if (!isFileSystemFileHandle(handle)) return

    registeredHandleOptions.set(handle, options)
    patchGetFileMethod(handle)
  }

  return new Proxy(showOpenFilePicker, {
    async apply(target, thisArg, args): Promise<unknown> {
      const handles = await Reflect.apply(target, thisArg, args)
      if (Array.isArray(handles)) handles.forEach(registerHandle)
      return handles
    },
  })
}

function patchGetFileMethod(handle: object): void {
  const methodOwner = findPropertyOwner(handle, "getFile")
  if (!methodOwner || patchedGetFileOwners.has(methodOwner)) return

  const descriptor = Reflect.getOwnPropertyDescriptor(methodOwner, "getFile")
  const nativeGetFile = descriptor?.value
  if (!descriptor || typeof nativeGetFile !== "function") return

  const interceptedGetFile = new Proxy(nativeGetFile, {
    async apply(target, thisArg, args): Promise<unknown> {
      const file = await Reflect.apply(target, thisArg, args)
      const options = isObject(thisArg) ? registeredHandleOptions.get(thisArg) : undefined
      if (!options?.isEnabled()) return file

      try {
        return await options.interceptFile(file)
      } catch {
        return file
      }
    },
  })

  const patched = Reflect.defineProperty(methodOwner, "getFile", {
    ...descriptor,
    value: interceptedGetFile,
  })
  if (patched) patchedGetFileOwners.add(methodOwner)
}

function findPropertyOwner(value: object, property: PropertyKey): object | null {
  let candidate: object | null = value
  while (candidate) {
    if (Object.prototype.hasOwnProperty.call(candidate, property)) return candidate
    candidate = Reflect.getPrototypeOf(candidate) as object | null
  }
  return null
}

function isFileSystemFileHandle(value: unknown): value is object {
  return (
    isObject(value) &&
    Reflect.get(value, "kind") === "file" &&
    typeof Reflect.get(value, "getFile") === "function"
  )
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null
}
