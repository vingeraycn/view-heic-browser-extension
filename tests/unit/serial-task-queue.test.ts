import { describe, expect, it, vi } from "vitest"
import { SerialTaskQueue } from "../../utils/serial-task-queue"

describe("SerialTaskQueue", () => {
  it("never overlaps tasks and preserves submission order", async () => {
    const queue = new SerialTaskQueue()
    const events: string[] = []
    let releaseFirst: (() => void) | undefined
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = queue.run(async () => {
      events.push("first:start")
      await firstGate
      events.push("first:end")
      return 1
    })
    const second = queue.run(async () => {
      events.push("second:start")
      events.push("second:end")
      return 2
    })

    await Promise.resolve()
    expect(events).toEqual(["first:start"])

    releaseFirst?.()
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2])
    expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"])
  })

  it("continues after a rejected task", async () => {
    const queue = new SerialTaskQueue()
    const first = queue.run(() => {
      throw new Error("expected")
    })
    const second = queue.run(() => "next")

    await expect(first).rejects.toThrow("expected")
    await expect(second).resolves.toBe("next")
  })

  it("drops queued tasks invalidated before they start", async () => {
    const queue = new SerialTaskQueue()
    let releaseFirst: (() => void) | undefined
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const first = queue.runIfCurrent(async () => {
      await firstGate
      return "first"
    }, "stale")
    const staleTask = vi.fn(() => "second")
    const second = queue.runIfCurrent(staleTask, "stale")

    await Promise.resolve()
    queue.invalidatePending()
    releaseFirst?.()

    await expect(first).resolves.toBe("first")
    await expect(second).resolves.toBe("stale")
    expect(staleTask).not.toHaveBeenCalled()
  })
})
