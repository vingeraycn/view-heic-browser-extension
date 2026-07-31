export interface PageConversionCounts {
  detected: number
  converted: number
  failed: number
  pending: number
}

type ConversionOutcome = "pending" | "converted" | "failed"

export interface PageConversionEntry<T extends object> {
  item: T
  version: string
}

interface VersionedOutcome {
  version: string
  outcome: ConversionOutcome
}

/**
 * Keeps page-level counts stable across extension and MIME-only detection.
 * Failed images may be retried without being counted as newly detected, while
 * a reused DOM node with a new source replaces the prior image in the totals.
 */
export class PageConversionLedger<T extends object> {
  private outcomes = new WeakMap<T, VersionedOutcome>()
  private counts: PageConversionCounts = {
    detected: 0,
    converted: 0,
    failed: 0,
    pending: 0,
  }

  reset(): void {
    this.outcomes = new WeakMap<T, VersionedOutcome>()
    this.counts = {
      detected: 0,
      converted: 0,
      failed: 0,
      pending: 0,
    }
  }

  begin(entries: readonly PageConversionEntry<T>[]): PageConversionCounts {
    for (const entry of entries) {
      let record = this.outcomes.get(entry.item)
      if (record && record.version !== entry.version) {
        this.remove(record.outcome)
        this.outcomes.delete(entry.item)
        record = undefined
      }

      if (record?.outcome === "pending" || record?.outcome === "converted") continue

      if (record?.outcome === "failed") {
        this.counts.failed -= 1
      } else {
        this.counts.detected += 1
      }

      this.counts.pending += 1
      this.outcomes.set(entry.item, { version: entry.version, outcome: "pending" })
    }

    return this.snapshot()
  }

  settle(
    entries: readonly PageConversionEntry<T>[],
    successes: readonly boolean[]
  ): PageConversionCounts {
    entries.forEach((entry, index) => {
      const record = this.outcomes.get(entry.item)
      if (record?.version !== entry.version || record.outcome !== "pending") return

      this.counts.pending -= 1
      if (successes[index]) {
        this.counts.converted += 1
        this.outcomes.set(entry.item, { ...record, outcome: "converted" })
      } else {
        this.counts.failed += 1
        this.outcomes.set(entry.item, { ...record, outcome: "failed" })
      }
    })

    return this.snapshot()
  }

  snapshot(): PageConversionCounts {
    return { ...this.counts }
  }

  private remove(outcome: ConversionOutcome): void {
    this.counts.detected -= 1
    this.counts[outcome] -= 1
  }
}
