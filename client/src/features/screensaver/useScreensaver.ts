import { inSleepWindow } from '@canopy/shared';
import { format } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { useNow } from '../../hooks/useNow';
import { useSettings } from '../../theme/ThemeProvider';

const WAKE_HOLDOFF_MS = 5 * 60_000; // a tap wakes the panel for 5 minutes

export type ScreensaverState = 'awake' | 'slideshow' | 'dim';

/**
 * Decides what the panel shows:
 * - inside the sleep window → dim or slideshow (per settings), a tap
 *   wakes it for a few minutes, then it drifts back to sleep;
 * - awake but idle for idleSlideshowMinutes → slideshow.
 */
export function useScreensaver(): { state: ScreensaverState; wake: () => void } {
  const settings = useSettings();
  const now = useNow();
  const [lastInteraction, setLastInteraction] = useState(() => Date.now());
  const [, forceTick] = useState(0);
  const wakeUntil = useRef(0);

  // Any interaction anywhere counts.
  useEffect(() => {
    const bump = () => setLastInteraction(Date.now());
    window.addEventListener('pointerdown', bump, { capture: true, passive: true });
    return () => window.removeEventListener('pointerdown', bump, { capture: true });
  }, []);

  // Re-evaluate idle state periodically (useNow only ticks per minute).
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const wake = () => {
    wakeUntil.current = Date.now() + WAKE_HOLDOFF_MS;
    setLastInteraction(Date.now());
  };

  const nowHHMM = format(now, 'HH:mm');
  const asleep =
    settings.sleepMode !== 'off' &&
    inSleepWindow(nowHHMM, settings.sleepStart, settings.sleepEnd) &&
    Date.now() > wakeUntil.current &&
    Date.now() - lastInteraction > 30_000; // don't sleep mid-interaction

  if (asleep) {
    return { state: settings.sleepMode === 'dim' ? 'dim' : 'slideshow', wake };
  }

  const idleMs = settings.idleSlideshowMinutes * 60_000;
  if (idleMs > 0 && Date.now() - lastInteraction > idleMs) {
    return { state: 'slideshow', wake };
  }

  return { state: 'awake', wake };
}
