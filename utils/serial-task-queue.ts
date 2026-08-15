/**
 * Runs asynchronous work in submission order while keeping each caller's
 * return value and error. A failed task never blocks the tasks behind it, and
 * callers can invalidate queued work when the state that authorized it changes.
 */
export class SerialTaskQueue {
  private tail: Promise<void> = Promise.resolve()
  private generation = 0

  run<T>(task: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(task)
    this.tail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  runIfCurrent<T>(task: () => Promise<T> | T, staleResult: T): Promise<T> {
    const taskGeneration = this.generation
    return this.run(() =>
      taskGeneration === this.generation ? task() : staleResult
    )
  }

  invalidatePending(): void {
    this.generation += 1
  }
}
