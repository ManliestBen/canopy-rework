import { format } from 'date-fns';
import { useNow } from '../hooks/useNow';

/**
 * The header clock + date, isolated into its own leaf so the minute tick
 * re-renders only these two lines — not the whole header/calendar tree.
 */
export function HeaderClock() {
  const now = useNow();
  return (
    <>
      <div className="header-clock" aria-live="off">
        {format(now, 'h:mm a')}
      </div>
      <div className="header-date">{format(now, 'EEEE, MMMM d')}</div>
    </>
  );
}
