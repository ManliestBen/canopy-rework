import { format } from 'date-fns';
import { MemberChip } from '../components/MemberChip';
import { TimerButton } from '../components/Timer';
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
      {/* Weather chip (Phase 5) lands here. */}
      <TimerButton />
      <div className="header-members">
        {users.map((u) => (
          <MemberChip key={u.id} user={u} />
        ))}
      </div>
    </header>
  );
}
