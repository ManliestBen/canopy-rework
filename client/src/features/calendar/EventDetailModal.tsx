import { formatKey, formatTime, type CalendarEvent } from '@canopy/shared';
import { MemberChip } from '../../components/MemberChip';
import { useUsers } from '../../lib/users';
import { describeRrule } from './recurrence';

export function EventDetailModal({
  event,
  onClose,
  onEdit,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  const users = useUsers();
  const member = users.find((u) => u.id === event.userId);

  const when = event.allDay
    ? event.startKey === event.endKey
      ? formatKey(event.startKey, 'EEEE, MMMM d')
      : `${formatKey(event.startKey, 'MMM d')} – ${formatKey(event.endKey, 'MMM d')}`
    : event.startKey === event.endKey
      ? `${formatKey(event.startKey, 'EEEE, MMMM d')} · ${formatTime(event.start)} – ${formatTime(event.end)}`
      : `${formatKey(event.startKey, 'MMM d')} ${formatTime(event.start)} – ${formatKey(event.endKey, 'MMM d')} ${formatTime(event.end)}`;

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal panel" onPointerDown={(e) => e.stopPropagation()}>
        <div className="event-detail-head">
          <span
            className="event-detail-swatch"
            style={{ background: `var(--family-${event.color})` }}
          />
          <h3>{event.title}</h3>
        </div>
        <p className="event-detail-when">{when}</p>
        {event.rrule && <p className="muted">↻ {describeRrule(event.rrule)}</p>}
        {event.location && <p>📍 {event.location}</p>}
        {event.description && (
          <p className="event-detail-desc muted">{event.description}</p>
        )}
        <p className="muted">
          {event.calendarTitle}
          {event.readOnly && ' · subscribed calendar (read-only)'}
        </p>
        {member && (
          <p style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MemberChip user={member} size={26} /> {member.name}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
          {!event.readOnly && (
            <button className="btn btn-primary" onClick={() => onEdit(event)}>
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
