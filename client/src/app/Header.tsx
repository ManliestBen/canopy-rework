import { format } from 'date-fns';
import { useNow } from '../hooks/useNow';
import { useSettings } from '../theme/ThemeProvider';

export function Header() {
  const now = useNow();
  const settings = useSettings();

  return (
    <header className="header">
      <div className="header-family">{settings.familyName}</div>
      <div className="header-clock" aria-live="off">
        {format(now, 'h:mm a')}
      </div>
      <div className="header-date">{format(now, 'EEEE, MMMM d')}</div>
      <div className="header-spacer" />
      {/* Weather chip (Phase 5) and member avatar chips (Phase 1) land here. */}
    </header>
  );
}
