import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { MemberChip } from '../components/MemberChip';
import { OfflineBadge } from '../components/OfflineBadge';
import { TimerButton } from '../components/Timer';
import { AnnounceButton } from '../features/announcements/Announcements';
import { WeatherChip } from '../features/weather/WeatherChip';
import { useNow } from '../hooks/useNow';
import { useUsers } from '../lib/users';
import { useSettings } from '../theme/ThemeProvider';

export function Header() {
  const now = useNow();
  const settings = useSettings();
  const users = useUsers();

  return (
    <header className="header">
      <div className="header-family">{settings.familyName}</div>
      <div className="header-clock" aria-live="off">
        {format(now, 'h:mm a')}
      </div>
      <div className="header-date">{format(now, 'EEEE, MMMM d')}</div>
      <div className="header-spacer" />
      <OfflineBadge />
      <WeatherChip />
      <AnnounceButton />
      <TimerButton />
      <Link to="/help" className="btn btn-ghost timer-launch" aria-label="Family guide">
        ❓
      </Link>
      <div className="header-members">
        {users.map((u) => (
          <MemberChip key={u.id} user={u} />
        ))}
      </div>
    </header>
  );
}
