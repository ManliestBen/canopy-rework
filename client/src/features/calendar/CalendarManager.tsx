import {
  FAMILY_COLORS,
  type CalendarSource,
  type EventsResponse,
  type FamilyColor,
} from '@canopy/shared';
import { useState } from 'react';
import { MemberChip } from '../../components/MemberChip';
import { useUsers } from '../../lib/users';
import {
  useCalendarMutations,
  useCalendarSources,
  useGoogleStatus,
  useVerifySource,
} from './api';

/**
 * Add/manage calendar sources. Designed for zero-frustration setup:
 * - Google: shows the service-account email with copy button and
 *   share instructions; verifies access BEFORE saving.
 * - ICS: paste any calendar URL (webcal:// ok); verified before save;
 *   the feed's own name pre-fills the title.
 */
export function CalendarManager({
  statuses,
  onClose,
}: {
  statuses: EventsResponse['calendars'];
  onClose: () => void;
}) {
  const { data: sources = [] } = useCalendarSources();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CalendarSource | null>(null);

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div
        className="modal panel"
        style={{ maxWidth: 640 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h3>Calendars</h3>
        {sources.length === 0 && !adding && (
          <p className="muted">
            No calendars yet. Add your family Google calendar, or subscribe to a
            school/team calendar by URL.
          </p>
        )}
        <div className="calman-rows">
          {sources.map((cal) => {
            const status = statuses.find((s) => s.id === cal.id);
            return (
              <div key={cal.id} className="calman-row">
                <span
                  className="event-detail-swatch"
                  style={{ background: `var(--family-${cal.color})` }}
                />
                <div className="calman-row-main">
                  <div className="calman-row-title">
                    {cal.title}
                    <span className="calman-badge">
                      {cal.sourceType === 'google' ? 'Google' : 'Subscribed'}
                    </span>
                  </div>
                  <div className="muted calman-row-status">
                    {status?.status === 'error'
                      ? `⚠️ ${status.error ?? 'Cannot reach this calendar'}`
                      : status?.status === 'pending'
                        ? 'Loading events…'
                        : status?.fetchedAt
                          ? `Updated ${new Date(status.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                          : ''}
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={() => setEditing(cal)}>
                  Edit
                </button>
              </div>
            );
          })}
        </div>

        {!adding && (
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            + Add calendar
          </button>
        )}
        {adding && <AddCalendarForm onDone={() => setAdding(false)} />}
        {editing && (
          <EditCalendarForm calendar={editing} onDone={() => setEditing(null)} />
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: FamilyColor;
  onChange: (c: FamilyColor) => void;
}) {
  return (
    <div className="swatch-row">
      {FAMILY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch${value === c ? ' selected' : ''}`}
          style={{ background: `var(--family-${c})` }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
    </div>
  );
}

function MemberPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const users = useUsers();
  if (users.length === 0) return null;
  return (
    <div className="field">
      <label>Whose calendar is this? (optional — shows their face on events)</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn${value === null ? ' btn-primary' : ''}`}
          onClick={() => onChange(null)}
        >
          Everyone
        </button>
        {users.map((u) => (
          <MemberChip
            key={u.id}
            user={u}
            size={44}
            selected={value === u.id}
            onClick={() => onChange(value === u.id ? null : u.id)}
          />
        ))}
      </div>
    </div>
  );
}

function AddCalendarForm({ onDone }: { onDone: () => void }) {
  const { data: google } = useGoogleStatus();
  const verify = useVerifySource();
  const { create } = useCalendarMutations();

  const [sourceType, setSourceType] = useState<'google' | 'ics'>('google');
  const [sourceRef, setSourceRef] = useState('');
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<FamilyColor>('teal');
  const [userId, setUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const verified = verify.data?.ok === true && !verify.isPending;

  return (
    <div className="calman-add">
      <div className="field">
        <label>Type</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn${sourceType === 'google' ? ' btn-primary' : ''}`}
            onClick={() => {
              setSourceType('google');
              verify.reset();
            }}
          >
            Google Calendar
          </button>
          <button
            className={`btn${sourceType === 'ics' ? ' btn-primary' : ''}`}
            onClick={() => {
              setSourceType('ics');
              verify.reset();
            }}
          >
            Calendar link (ICS)
          </button>
        </div>
      </div>

      {sourceType === 'google' && !google?.configured && (
        <p className="muted">
          ⚠️ Google isn't connected yet. An admin needs to add a service-account
          key on the server — see the setup guide (docs/SETUP_GOOGLE.md).
        </p>
      )}

      {sourceType === 'google' && google?.configured && (
        <div className="calman-help">
          <p style={{ margin: 0 }}>
            In Google Calendar → your calendar → <b>Settings and sharing</b> →{' '}
            <b>Share with specific people</b>, add:
          </p>
          <div className="calman-email-row">
            <code>{google.serviceAccountEmail}</code>
            <button
              className="btn"
              onClick={() => {
                void navigator.clipboard?.writeText(google.serviceAccountEmail ?? '');
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Then paste the <b>Calendar ID</b> (Settings → "Integrate calendar")
            below.
          </p>
        </div>
      )}

      <div className="field">
        <label>{sourceType === 'google' ? 'Calendar ID' : 'Calendar URL'}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder={
              sourceType === 'google'
                ? 'e.g. family123@group.calendar.google.com'
                : 'https://… .ics or webcal://…'
            }
            value={sourceRef}
            onChange={(e) => {
              setSourceRef(e.target.value);
              verify.reset();
            }}
          />
          <button
            className="btn"
            disabled={sourceRef.trim().length < 3 || verify.isPending}
            onClick={() =>
              verify.mutate(
                { sourceType, sourceRef: sourceRef.trim() },
                {
                  onSuccess: (r) => {
                    if (r.ok && r.summary && title === '') setTitle(r.summary);
                  },
                },
              )
            }
          >
            {verify.isPending ? 'Checking…' : 'Check'}
          </button>
        </div>
        {verify.data && (
          <p
            style={{
              color: verify.data.ok ? 'var(--success)' : 'var(--danger)',
              fontWeight: 700,
              margin: '4px 0 0',
            }}
          >
            {verify.data.ok
              ? `✓ Found${verify.data.summary ? `: ${verify.data.summary}` : ' it!'}`
              : verify.data.error}
          </p>
        )}
      </div>

      <div className="field">
        <label>Name in Canopy</label>
        <input
          className="input"
          placeholder="e.g. Family, School, Soccer"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Color</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <MemberPicker value={userId} onChange={setUserId} />

      {create.isError && <p style={{ color: 'var(--danger)' }}>{create.error.message}</p>}

      <div className="modal-actions">
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={!verified || title.trim() === '' || create.isPending}
          title={verified ? undefined : 'Check the calendar first'}
          onClick={() =>
            create.mutate(
              {
                title: title.trim(),
                sourceType,
                sourceRef: sourceRef.trim(),
                color,
                userId,
              },
              { onSuccess: onDone },
            )
          }
        >
          Add calendar
        </button>
      </div>
    </div>
  );
}

function EditCalendarForm({
  calendar,
  onDone,
}: {
  calendar: CalendarSource;
  onDone: () => void;
}) {
  const { patch, remove } = useCalendarMutations();
  const [title, setTitle] = useState(calendar.title);
  const [color, setColor] = useState<FamilyColor>(calendar.color);
  const [userId, setUserId] = useState<string | null>(calendar.userId);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="calman-add">
      <h4 style={{ margin: '0 0 10px' }}>Edit “{calendar.title}”</h4>
      <div className="field">
        <label>Name</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>Color</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <MemberPicker value={userId} onChange={setUserId} />
      <div className="modal-actions">
        {!confirmRemove ? (
          <button
            className="btn btn-ghost"
            style={{ color: 'var(--danger)' }}
            onClick={() => setConfirmRemove(true)}
          >
            Remove
          </button>
        ) : (
          <button
            className="btn btn-danger"
            onClick={() => remove.mutate(calendar.id, { onSuccess: onDone })}
          >
            Really remove?
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={title.trim() === ''}
          onClick={() =>
            patch.mutate(
              { id: calendar.id, title: title.trim(), color, userId },
              { onSuccess: onDone },
            )
          }
        >
          Save
        </button>
      </div>
    </div>
  );
}
