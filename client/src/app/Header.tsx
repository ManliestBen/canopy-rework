import { Link } from 'react-router-dom';
import { HeaderClock } from '../components/HeaderClock';
import { MemberChip } from '../components/MemberChip';
import { OfflineBadge } from '../components/OfflineBadge';
import { TimerButton } from '../components/Timer';
import { AnnounceButton } from '../features/announcements/Announcements';
import { WeatherChip } from '../features/weather/WeatherChip';
import { useUsers } from '../lib/users';
import { useSettings } from '../theme/ThemeProvider';

export function Header() {
  const settings = useSettings();
  const users = useUsers();

  return (
    <header className="header">
      <div className="header-family">{settings.familyName}</div>
      <HeaderClock />
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
