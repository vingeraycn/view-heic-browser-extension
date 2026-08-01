import { describe, expect, it } from "vitest"
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
})
