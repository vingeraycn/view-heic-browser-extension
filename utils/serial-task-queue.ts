/**
 * Runs asynchronous work in submission order while keeping each caller's
 * return value and error. A failed task never blocks the tasks behind it.
 */
export class SerialTaskQueue {
  private tail: Promise<void> = Promise.resolve()

  run<T>(task: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(task)
    this.tail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}
