import { useNow } from '../hooks/useNow';

/**
 * The "now" line on the calendar time grid, isolated into its own leaf so the
 * minute tick that moves it doesn't re-render the whole 24h grid.
 */
export function NowLine({ pxPerMinute }: { pxPerMinute: number }) {
  const now = useNow();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return <div className="timegrid-nowline" style={{ top: nowMinutes * pxPerMinute }} />;
}
