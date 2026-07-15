import { formatKey, formatTime, type CalendarEvent, type DateKey } from '@canopy/shared';
import { useEffect, useMemo, useRef } from 'react';
import { useNow } from '../../hooks/useNow';
import { EventMemberDot } from './EventPill';
import { layoutBanners, layoutDay, isBanner } from './layout';

const HOUR_PX = 56;

function hourLabel(h: number): string {
  return new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });
}

/**
 * The day/week/2-week time grid: banner lane on top (all-day and
 * multi-day events as spanning bars), scrollable 24h grid below.
 */
export function TimeGridView({
  days,
  events,
  todayKey,
  onSlotClick,
  onEventClick,
  onAddForDay,
}: {
  days: DateKey[];
  events: CalendarEvent[];
  todayKey: DateKey;
  onSlotClick: (day: DateKey, hour: number) => void;
  onEventClick: (event: CalendarEvent) => void;
  onAddForDay: (day: DateKey) => void;
}) {
  const now = useNow();
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Open at 7am so the school-morning window is visible.
    scroller.current?.scrollTo({ top: 7 * HOUR_PX });
  }, []);

  const banners = useMemo(() => layoutBanners(events, days), [events, days]);
  const bannerRows = banners.reduce((max, b) => Math.max(max, b.row + 1), 0);
  const timed = useMemo(() => events.filter((e) => !isBanner(e)), [events]);
  const perDay = useMemo(
    () => days.map((day) => layoutDay(timed, day)),
    [timed, days],
  );

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const colWidth = `calc((100% - 56px) / ${days.length})`;

  return (
    <div className="timegrid panel">
      {/* Day headers */}
      <div className="timegrid-header">
        <div className="timegrid-gutter" />
        {days.map((day) => {
          const count = events.filter(
            (e) => e.startKey <= day && e.endKey >= day,
          ).length;
          return (
            <div
              key={day}
              className={`timegrid-dayhead${day === todayKey ? ' today' : ''}`}
            >
              <button
                type="button"
                className="timegrid-dayhead-label"
                onClick={() => onAddForDay(day)}
              >
                <span className="dayhead-name">{formatKey(day, 'EEE')}</span>
                <span className="dayhead-num">{formatKey(day, 'd')}</span>
              </button>
              <span className="dayhead-meta">
                {count === 0 ? ' ' : `${count} event${count === 1 ? '' : 's'}`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Banner lane */}
      {bannerRows > 0 && (
        <div
          className="timegrid-banners"
          style={{ height: bannerRows * 30 + 6 }}
        >
          {banners.map((b) => (
            <button
              key={`${b.event.calendarId}:${b.event.id}`}
              type="button"
              className={`banner${b.clippedStart ? ' clip-start' : ''}${b.clippedEnd ? ' clip-end' : ''}`}
              style={{
                background: `var(--pastel-${b.event.color})`,
                left: `calc(56px + ${b.startCol} * ${colWidth})`,
                width: `calc(${b.endCol - b.startCol + 1} * ${colWidth} - 6px)`,
                top: b.row * 30 + 3,
              }}
              onClick={() => onEventClick(b.event)}
            >
              {b.event.title}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable 24h grid */}
      <div className="timegrid-scroll" ref={scroller}>
        <div className="timegrid-body" style={{ height: 24 * HOUR_PX }}>
          <div className="timegrid-gutter">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="timegrid-hourlabel" style={{ top: h * HOUR_PX }}>
                {h === 0 ? '' : hourLabel(h)}
              </div>
            ))}
          </div>
          {days.map((day, dayIdx) => (
            <div key={day} className={`timegrid-col${day === todayKey ? ' today' : ''}`}>
              {Array.from({ length: 24 }, (_, h) => (
                <button
                  key={h}
                  type="button"
                  className="timegrid-slot"
                  style={{ top: h * HOUR_PX, height: HOUR_PX }}
                  onClick={() => onSlotClick(day, h)}
                  aria-label={`Add event ${day} ${h}:00`}
                />
              ))}
              {perDay[dayIdx]!.map((p) => (
                <button
                  key={`${p.event.calendarId}:${p.event.id}`}
                  type="button"
                  className={`timegrid-event${p.continuesBefore ? ' cont-before' : ''}${p.continuesAfter ? ' cont-after' : ''}`}
                  style={{
                    background: `var(--pastel-${p.event.color})`,
                    top: (p.startMin / 60) * HOUR_PX,
                    height: ((p.endMin - p.startMin) / 60) * HOUR_PX - 2,
                    left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                    width: `calc(${100 / p.lanes}% - 6px)`,
                  }}
                  onClick={() => onEventClick(p.event)}
                >
                  <span className="timegrid-event-title">{p.event.title}</span>
                  <span className="timegrid-event-time">
                    {formatTime(p.event.start)} – {formatTime(p.event.end)}
                  </span>
                  <span className="timegrid-event-dot">
                    <EventMemberDot event={p.event} size={18} />
                  </span>
                </button>
              ))}
              {day === todayKey && (
                <div
                  className="timegrid-nowline"
                  style={{ top: (nowMinutes / 60) * HOUR_PX }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
