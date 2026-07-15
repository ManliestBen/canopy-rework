import {
  formatKey,
  formatTime,
  keysInRange,
  type CalendarEvent,
  type DateKey,
} from '@canopy/shared';
import { useMemo } from 'react';
import { EventMemberDot } from './EventPill';

/**
 * "What's next" — today and the coming days as a list. The glanceable
 * view the panel spends most of its life on.
 */
export function AgendaView({
  from,
  to,
  events,
  todayKey,
  onEventClick,
}: {
  from: DateKey;
  to: DateKey;
  events: CalendarEvent[];
  todayKey: DateKey;
  onEventClick: (event: CalendarEvent) => void;
}) {
  const days = useMemo(() => keysInRange(from, to), [from, to]);

  return (
    <div className="agenda">
      {days.map((day) => {
        const dayEvents = events
          .filter((e) => e.startKey <= day && e.endKey >= day)
          .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
        if (dayEvents.length === 0) return null;
        return (
          <section key={day} className="agenda-day panel">
            <h3 className={`agenda-day-title${day === todayKey ? ' today' : ''}`}>
              {day === todayKey ? 'Today' : formatKey(day, 'EEEE')}
              <span className="agenda-day-date">{formatKey(day, 'MMMM d')}</span>
            </h3>
            <div className="agenda-rows">
              {dayEvents.map((ev) => (
                <button
                  key={`${ev.calendarId}:${ev.id}:${day}`}
                  type="button"
                  className="agenda-row"
                  onClick={() => onEventClick(ev)}
                >
                  <span
                    className="agenda-dot"
                    style={{ background: `var(--family-${ev.color})` }}
                  />
                  <span className="agenda-time">
                    {ev.allDay ? 'All day' : formatTime(ev.start)}
                  </span>
                  <span className="agenda-title">{ev.title}</span>
                  <span className="agenda-cal muted">{ev.calendarTitle}</span>
                  <EventMemberDot event={ev} size={22} />
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {events.length === 0 && (
        <div className="panel placeholder-page" style={{ height: '40vh' }}>
          <div>
            <p style={{ fontSize: '2rem', margin: 0 }}>🗓️</p>
            <p className="muted">Nothing coming up. Enjoy the quiet!</p>
          </div>
        </div>
      )}
    </div>
  );
}
