import type { CalendarEvent } from '@canopy/shared';
import { formatTime } from '@canopy/shared';
import { MemberChip } from '../../components/MemberChip';
import { useUsers } from '../../lib/users';

/** Small member dot shown on pills for linked calendars (Skylight style). */
export function EventMemberDot({ event, size = 20 }: { event: CalendarEvent; size?: number }) {
  const users = useUsers();
  const user = users.find((u) => u.id === event.userId);
  if (!user) return null;
  return <MemberChip user={user} size={size} />;
}

/** Compact pill for month/agenda contexts. */
export function EventPill({
  event,
  onClick,
  showTime = true,
}: {
  event: CalendarEvent;
  onClick: (e: CalendarEvent) => void;
  showTime?: boolean;
}) {
  return (
    <button
      type="button"
      className="event-pill"
      style={{ background: `var(--pastel-${event.color})` }}
      onClick={() => onClick(event)}
    >
      <span className="event-pill-title">{event.title}</span>
      {showTime && !event.allDay && (
        <span className="event-pill-time">{formatTime(event.start)}</span>
      )}
      <EventMemberDot event={event} size={18} />
    </button>
  );
}
