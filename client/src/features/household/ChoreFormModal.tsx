import { todayKey, type Chore, type DateKey } from '@canopy/shared';
import { useState } from 'react';
import { MemberChip } from '../../components/MemberChip';
import { useUsers } from '../../lib/users';
import { useChoreMutations } from './api';

export type ChoreFormSeed = { mode: 'create' } | { mode: 'edit'; chore: Chore };

const ICONS = ['', '🛏️', '🧹', '🍽️', '🗑️', '🐕', '🐈', '📚', '🧺', '🌱', '🚿', '🧸'];

export function ChoreFormModal({
  seed,
  dateKey,
  onClose,
}: {
  seed: ChoreFormSeed;
  dateKey: DateKey;
  onClose: () => void;
}) {
  const users = useUsers();
  const { create, patch, remove } = useChoreMutations(dateKey);
  const editing = seed.mode === 'edit' ? seed.chore : null;

  const [title, setTitle] = useState(editing?.title ?? '');
  const [icon, setIcon] = useState(editing?.icon ?? '');
  const [userId, setUserId] = useState(editing?.userId ?? users[0]?.id ?? '');
  const [points, setPoints] = useState(editing?.points ?? 1);
  const [schedule, setSchedule] = useState<Chore['schedule']>(editing?.schedule ?? 'daily');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const valid = title.trim() !== '' && userId !== '';

  const save = () => {
    const payload = {
      title: title.trim(),
      icon,
      userId,
      points,
      schedule,
      anchorKey: editing?.anchorKey ?? todayKey(),
    };
    if (editing) patch.mutate({ id: editing.id, ...payload }, { onSuccess: onClose });
    else create.mutate(payload, { onSuccess: onClose });
  };

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal panel" onPointerDown={(e) => e.stopPropagation()}>
        <h3>{editing ? 'Edit chore' : 'New chore'}</h3>
        <div className="field">
          <label htmlFor="chore-title">Chore</label>
          <input
            id="chore-title"
            className="input"
            value={title}
            autoFocus
            placeholder="e.g. Make bed"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Icon</label>
          <div className="swatch-row">
            {ICONS.map((i) => (
              <button
                key={i || 'none'}
                type="button"
                className={`swatch swatch-emoji${icon === i ? ' selected' : ''}`}
                onClick={() => setIcon(i)}
              >
                {i || '–'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Who</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {users.map((u) => (
              <MemberChip
                key={u.id}
                user={u}
                size={44}
                selected={userId === u.id}
                onClick={() => setUserId(u.id)}
              />
            ))}
          </div>
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="chore-schedule">Repeats</label>
            <select
              id="chore-schedule"
              className="input"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as Chore['schedule'])}
            >
              <option value="daily">Every day</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Weekly (from today)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="chore-points">Stars</label>
            <select
              id="chore-points"
              className="input"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
            >
              {[1, 2, 3, 5, 10].map((p) => (
                <option key={p} value={p}>
                  {p} ⭐
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-actions">
          {editing && !confirmDelete && (
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--danger)' }}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          )}
          {editing && confirmDelete && (
            <button
              className="btn btn-danger"
              onClick={() => remove.mutate(editing.id, { onSuccess: onClose })}
            >
              Really delete?
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
