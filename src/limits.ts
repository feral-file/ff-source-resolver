/**
 * tokenLimitTarget returns the number of usable findings an adapter should
 * collect to both satisfy a caller limit and prove that more source tokens
 * exist. Undefined preserves unbounded historical behavior.
 */
export function tokenLimitTarget(limit: number | undefined): number | undefined {
  return limit == null ? undefined : limit + 1;
}

/**
 * limitTokenFindings trims token findings to a caller limit after adapters have
 * optionally collected one extra item for hasMore detection.
 */
export function limitTokenFindings<T>(results: readonly T[], limit: number | undefined): T[] {
  return limit == null ? [...results] : results.slice(0, limit);
}
