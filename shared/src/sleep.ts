/**
 * Sleep-window math. Windows may cross midnight ("21:30" → "06:30").
 * Pure so both the panel and tests can reason about it.
 */
export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function inSleepWindow(nowHHMM: string, start: string, end: string): boolean {
  const now = minutesOfDay(nowHHMM);
  const s = minutesOfDay(start);
  const e = minutesOfDay(end);
  if (s === e) return false; // zero-length window = never asleep
  if (s < e) return now >= s && now < e; // same-day window
  return now >= s || now < e; // crosses midnight
}
