/** ISO timestamp for "N hours ago" (kept out of components so render code stays pure). */
export function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}
