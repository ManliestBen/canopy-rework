import { useEffect, useState } from 'react';

/**
 * A clock that ticks on the minute — so "today" and the header time roll
 * over correctly at midnight (the original app froze "today" at mount).
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const msToNextMinute = 60_000 - (Date.now() % 60_000);
      timeout = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msToNextMinute);
    };
    schedule();
    return () => clearTimeout(timeout);
  }, []);

  return now;
}
