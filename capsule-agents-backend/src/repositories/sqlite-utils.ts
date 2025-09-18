export function getChanges(result: unknown): number {
  if (typeof result === "number") {
    return result
  }

  if (result && typeof result === "object" && "changes" in result) {
    const value = (result as { changes?: unknown }).changes
    if (typeof value === "number") {
      return value
    }
    if (typeof value === "bigint") {
      return Number(value)
    }
  }

  return 0
}
