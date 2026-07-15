import {
  instantToLocal,
  type CalendarEvent,
  type CalendarSource,
  type DateKey,
  type EventInput,
} from '@canopy/shared';
import { useState } from 'react';
import { useEventMutations } from './api';
import {
  describeRrule,
  presetToRrule,
  rruleToPreset,
  type RecurrencePreset,
} from './recurrence';

export type EventFormSeed =
  | { mode: 'create'; startKey: DateKey; startTime?: string }
  | { mode: 'edit'; event: CalendarEvent };

function minutesToHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

const PRESET_LABELS: Record<RecurrencePreset, string> = {
  none: 'Does not repeat',
  daily: 'Every day',
  weekdays: 'Every weekday (Mon–Fri)',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  custom: 'Custom (kept as-is)',
};

export function EventFormModal({
  seed,
  calendars,
  onClose,
}: {
  seed: EventFormSeed;
  calendars: CalendarSource[]; // writable (Google) sources only
  onClose: () => void;
}) {
  const { create, update, remove } = useEventMutations();
  const editing = seed.mode === 'edit' ? seed.event : null;

  const [calendarId, setCalendarId] = useState(
    editing?.calendarId ?? calendars[0]?.id ?? '',
  );
  const [title, setTitle] = useState(editing?.title ?? '');
  const [allDay, setAllDay] = useState(editing?.allDay ?? false);
  const [startKey, setStartKey] = useState(
    editing ? editing.startKey : seed.mode === 'create' ? seed.startKey : '',
  );
  const [endKey, setEndKey] = useState(editing?.endKey ?? startKey);
  const [startTime, setStartTime] = useState(() => {
    if (editing && !editing.allDay) return minutesToHHMM(instantToLocal(editing.start).minutes);
    return seed.mode === 'create' ? (seed.startTime ?? '09:00') : '09:00';
  });
  const [endTime, setEndTime] = useState(() => {
    if (editing && !editing.allDay) return minutesToHHMM(instantToLocal(editing.end).minutes);
    const [h] = (seed.mode === 'create' ? (seed.startTime ?? '09:00') : '09:00').split(':');
    return `${String(Math.min(Number(h) + 1, 23)).padStart(2, '0')}:00`;
  });
  const [location, setLocation] = useState(editing?.location ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const originalRrule = editing?.rrule;
  const [preset, setPreset] = useState<RecurrencePreset>(rruleToPreset(originalRrule));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const busy = create.isPending || update.isPending || remove.isPending;
  const error = create.error ?? update.error ?? remove.error;
  const valid =
    title.trim() !== '' &&
    calendarId !== '' &&
    startKey !== '' &&
    endKey >= startKey &&
    (allDay || (startKey !== endKey || endTime > startTime));

  const submit = async () => {
    const input: EventInput = {
      title: title.trim(),
      allDay,
      startKey,
      endKey: endKey < startKey ? startKey : endKey,
      ...(allDay ? {} : { startTime, endTime }),
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      // 'custom' preserves the original rule VERBATIM — the original
      // app rewrote it to "every weekday" here, corrupting events.
      rrule:
        preset === 'custom' ? originalRrule : presetToRrule(preset, startKey),
    };
    if (editing) {
      await update.mutateAsync({
        calendarId: editing.calendarId,
        eventId: editing.id,
        input,
      });
    } else {
      await create.mutateAsync({ calendarId, input });
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal panel" onPointerDown={(e) => e.stopPropagation()}>
        <h3>{editing ? 'Edit event' : 'New event'}</h3>

        {calendars.length === 0 ? (
          <p className="muted">
            Add a Google calendar first (Calendar → Manage calendars). Subscribed
            ICS calendars are read-only.
          </p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="ev-title">What</label>
              <input
                id="ev-title"
                className="input"
                value={title}
                autoFocus
                placeholder="e.g. 🦷 Dentist"
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {!editing && calendars.length > 1 && (
              <div className="field">
                <label htmlFor="ev-cal">Calendar</label>
                <select
                  id="ev-cal"
                  className="input"
                  value={calendarId}
                  onChange={(e) => setCalendarId(e.target.value)}
                >
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="field">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                />
                All day
              </label>
            </div>

            <div className="field-grid">
              <div className="field">
                <label htmlFor="ev-start">Starts</label>
                <input
                  id="ev-start"
                  type="date"
                  className="input"
                  value={startKey}
                  onChange={(e) => {
                    setStartKey(e.target.value);
                    if (endKey < e.target.value) setEndKey(e.target.value);
                  }}
                />
                {!allDay && (
                  <input
                    type="time"
                    className="input"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                )}
              </div>
              <div className="field">
                <label htmlFor="ev-end">Ends</label>
                <input
                  id="ev-end"
                  type="date"
                  className="input"
                  value={endKey}
                  min={startKey}
                  onChange={(e) => setEndKey(e.target.value)}
                />
                {!allDay && (
                  <input
                    type="time"
                    className="input"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                )}
              </div>
            </div>

            <div className="field">
              <label htmlFor="ev-repeat">Repeats</label>
              <select
                id="ev-repeat"
                className="input"
                value={preset}
                onChange={(e) => setPreset(e.target.value as RecurrencePreset)}
              >
                {(
                  ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const
                ).map((p) => (
                  <option key={p} value={p}>
                    {PRESET_LABELS[p]}
                  </option>
                ))}
                {rruleToPreset(originalRrule) === 'custom' && (
                  <option value="custom">{PRESET_LABELS.custom}</option>
                )}
              </select>
              {preset === 'custom' && (
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  ↻ {describeRrule(originalRrule)} — Canopy will keep this rule
                  exactly as it is.
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="ev-loc">Where (optional)</label>
              <input
                id="ev-loc"
                className="input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="ev-desc">Notes (optional)</label>
              <textarea
                id="ev-desc"
                className="input"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {error && <p style={{ color: 'var(--danger)' }}>{error.message}</p>}

            <div className="modal-actions">
              {editing && !confirmDelete && (
                <button
                  className="btn btn-ghost"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                >
                  Delete
                </button>
              )}
              {editing && confirmDelete && (
                <button
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={async () => {
                    await remove.mutateAsync({
                      calendarId: editing.calendarId,
                      eventId: editing.id,
                    });
                    onClose();
                  }}
                >
                  Really delete{editing.rrule ? ' entire series' : ''}?
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button className="btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
