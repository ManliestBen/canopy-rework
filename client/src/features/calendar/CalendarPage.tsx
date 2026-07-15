import {
  addDaysToKey,
  addMonthsToKey,
  addWeeksToKey,
  formatKey,
  monthGridKeys,
  todayKey as computeTodayKey,
  weekKeys,
  weekStartKey,
  type CalendarEvent,
  type DateKey,
} from '@canopy/shared';
import { useEffect, useMemo, useState } from 'react';
import { MemberChip } from '../../components/MemberChip';
import { useUsers } from '../../lib/users';
import { AnnouncementStrip } from '../announcements/Announcements';
import { AgendaView } from './AgendaView';
import { CalendarManager } from './CalendarManager';
import { EventDetailModal } from './EventDetailModal';
import { EventFormModal, type EventFormSeed } from './EventFormModal';
import { MonthView } from './MonthView';
import { TimeGridView } from './TimeGridView';
import { useCalendarSources, useEventsRange } from './api';
import './calendar.css';

type ViewMode = 'agenda' | 'day' | 'week' | 'biweek' | 'month';

const VIEW_LABELS: Record<ViewMode, string> = {
  agenda: 'Agenda',
  day: 'Day',
  week: 'Week',
  biweek: '2 Weeks',
  month: 'Month',
};

export function CalendarPage() {
  // todayKey must roll over at midnight, but we don't want a per-minute tick
  // to re-render the whole page. Poll once a minute and only update state on
  // the tick that actually crosses midnight (referential no-op otherwise, so
  // React bails out of the re-render).
  const [todayKey, setTodayKey] = useState(computeTodayKey);
  useEffect(() => {
    const id = setInterval(() => {
      setTodayKey((prev) => {
        const next = computeTodayKey();
        return next === prev ? prev : next;
      });
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const [view, setView] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState<DateKey>(todayKey);
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CalendarEvent | null>(null);
  const [formSeed, setFormSeed] = useState<EventFormSeed | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);

  const users = useUsers();
  const { data: sources = [] } = useCalendarSources();
  const writable = useMemo(() => sources.filter((s) => s.sourceType === 'google'), [sources]);

  const range = useMemo((): { from: DateKey; to: DateKey; days: DateKey[] } => {
    switch (view) {
      case 'day':
        return { from: anchor, to: anchor, days: [anchor] };
      case 'week': {
        const days = weekKeys(anchor);
        return { from: days[0]!, to: days[6]!, days };
      }
      case 'biweek': {
        const start = weekStartKey(anchor);
        const days = Array.from({ length: 14 }, (_, i) => addDaysToKey(start, i));
        return { from: days[0]!, to: days[13]!, days };
      }
      case 'month': {
        const keys = monthGridKeys(anchor);
        return { from: keys[0]!, to: keys[keys.length - 1]!, days: keys };
      }
      case 'agenda':
        return { from: todayKey, to: addDaysToKey(todayKey, 13), days: [] };
    }
  }, [view, anchor, todayKey]);

  const { data, isError } = useEventsRange(range.from, range.to);

  const events = useMemo(() => {
    const all = data?.events ?? [];
    if (!filterUserId) return all;
    return all.filter((e) => e.userId === filterUserId || e.userId === null);
  }, [data, filterUserId]);

  const calendarProblems = (data?.calendars ?? []).filter((c) => c.status === 'error');

  const navigate = (dir: -1 | 1) => {
    if (view === 'day') setAnchor(addDaysToKey(anchor, dir));
    else if (view === 'week') setAnchor(addWeeksToKey(anchor, dir));
    else if (view === 'biweek') setAnchor(addWeeksToKey(anchor, dir * 2));
    else if (view === 'month') setAnchor(addMonthsToKey(anchor, dir));
  };

  const title =
    view === 'day'
      ? formatKey(anchor, 'EEEE, MMMM d')
      : view === 'month'
        ? formatKey(anchor, 'MMMM yyyy')
        : view === 'agenda'
          ? 'Coming up'
          : `${formatKey(range.from, 'MMM d')} – ${formatKey(range.to, 'MMM d')}`;

  return (
    <div className="calendar-page">
      <AnnouncementStrip />
      <div className="cal-toolbar">
        <h1 className="page-title" style={{ margin: 0 }}>
          {title}
        </h1>
        {view !== 'agenda' && (
          <div className="cal-nav">
            <button className="btn" onClick={() => navigate(-1)} aria-label="Previous">
              ‹
            </button>
            <button className="btn" onClick={() => setAnchor(todayKey)}>
              Today
            </button>
            <button className="btn" onClick={() => navigate(1)} aria-label="Next">
              ›
            </button>
          </div>
        )}
        <div style={{ flex: 1 }} />
        {users.length > 1 && (
          <div className="cal-filter">
            {users.map((u) => (
              <MemberChip
                key={u.id}
                user={u}
                size={38}
                selected={filterUserId === u.id}
                onClick={() => setFilterUserId(filterUserId === u.id ? null : u.id)}
              />
            ))}
          </div>
        )}
        <div className="cal-views">
          {(Object.keys(VIEW_LABELS) as ViewMode[]).map((v) => (
            <button
              key={v}
              className={`btn${view === v ? ' btn-primary' : ''}`}
              onClick={() => setView(v)}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={() => setManagerOpen(true)}>
          Manage
        </button>
      </div>

      {isError && !data && (
        <div className="cal-warning">Canopy can't reach the server right now.</div>
      )}
      {calendarProblems.length > 0 && (
        <div className="cal-warning">
          ⚠️ {calendarProblems.map((c) => c.title).join(', ')}:{' '}
          {calendarProblems[0]!.error ?? 'not updating'} — showing last known events.
        </div>
      )}
      {sources.length === 0 && (
        <div className="panel cal-empty">
          <p style={{ fontSize: '2.2rem', margin: 0 }}>📅</p>
          <p style={{ fontWeight: 800 }}>Let's connect your calendars.</p>
          <p className="muted">
            Google calendars stay in sync both ways; school and team calendars can
            be subscribed by link.
          </p>
          <button className="btn btn-primary" onClick={() => setManagerOpen(true)}>
            Add a calendar
          </button>
        </div>
      )}

      {sources.length > 0 && view === 'agenda' && (
        <AgendaView
          from={range.from}
          to={range.to}
          events={events}
          todayKey={todayKey}
          onEventClick={setDetail}
        />
      )}
      {sources.length > 0 && (view === 'day' || view === 'week' || view === 'biweek') && (
        <TimeGridView
          days={range.days}
          events={events}
          todayKey={todayKey}
          onSlotClick={(day, hour) =>
            setFormSeed({
              mode: 'create',
              startKey: day,
              startTime: `${String(hour).padStart(2, '0')}:00`,
            })
          }
          onEventClick={setDetail}
          onAddForDay={(day) => setFormSeed({ mode: 'create', startKey: day })}
        />
      )}
      {sources.length > 0 && view === 'month' && (
        <MonthView
          anchor={anchor}
          events={events}
          todayKey={todayKey}
          onDayOpen={(day) => {
            setAnchor(day);
            setView('day');
          }}
          onEventClick={setDetail}
        />
      )}

      {writable.length > 0 && (
        <button
          className="fab"
          aria-label="Add event"
          onClick={() => setFormSeed({ mode: 'create', startKey: todayKey })}
        >
          +
        </button>
      )}

      {detail && (
        <EventDetailModal
          event={detail}
          onClose={() => setDetail(null)}
          onEdit={(ev) => {
            setDetail(null);
            setFormSeed({ mode: 'edit', event: ev });
          }}
        />
      )}
      {formSeed && (
        <EventFormModal
          seed={formSeed}
          calendars={writable}
          onClose={() => setFormSeed(null)}
        />
      )}
      {managerOpen && (
        <CalendarManager
          statuses={data?.calendars ?? []}
          onClose={() => setManagerOpen(false)}
        />
      )}
    </div>
  );
}
