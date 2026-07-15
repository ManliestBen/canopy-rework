import {
  formatKey,
  monthGridKeys,
  type CalendarEvent,
  type DateKey,
} from '@canopy/shared';
import { useMemo } from 'react';
import { EventPill } from './EventPill';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_PILLS = 3;

export function MonthView({
  anchor,
  events,
  todayKey,
  onDayOpen,
  onEventClick,
}: {
  anchor: DateKey;
  events: CalendarEvent[];
  todayKey: DateKey;
  onDayOpen: (day: DateKey) => void;
  onEventClick: (event: CalendarEvent) => void;
}) {
  const days = useMemo(() => monthGridKeys(anchor), [anchor]);
  const anchorMonth = anchor.slice(0, 7);

  const byDay = useMemo(() => {
    const map = new Map<DateKey, CalendarEvent[]>();
    for (const day of days) map.set(day, []);
    for (const ev of events) {
      for (const day of days) {
        if (ev.startKey <= day && ev.endKey >= day) map.get(day)!.push(ev);
      }
    }
    return map;
  }, [events, days]);

  return (
    <div className="monthview panel">
      <div className="monthview-weekdays">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="monthview-grid" style={{ gridTemplateRows: `repeat(${days.length / 7}, 1fr)` }}>
        {days.map((day) => {
          const dayEvents = byDay.get(day)!;
          const extra = dayEvents.length - MAX_PILLS;
          return (
            <div
              key={day}
              className={[
                'monthview-cell',
                day === todayKey ? 'today' : '',
                day.slice(0, 7) === anchorMonth ? '' : 'outside',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                className="monthview-daynum"
                onClick={() => onDayOpen(day)}
              >
                {formatKey(day, 'd')}
              </button>
              <div className="monthview-pills">
                {dayEvents.slice(0, MAX_PILLS).map((ev) => (
                  <EventPill
                    key={`${ev.calendarId}:${ev.id}:${day}`}
                    event={ev}
                    onClick={onEventClick}
                    showTime={false}
                  />
                ))}
                {extra > 0 && (
                  <button
                    type="button"
                    className="monthview-more"
                    onClick={() => onDayOpen(day)}
                  >
                    +{extra} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
