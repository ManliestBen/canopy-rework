import { SCHEDULES, SCHEDULE_LABELS, todayKey, type Schedule, type Task } from '@canopy/shared';
import { useState } from 'react';
import { MemberChip } from '../../components/MemberChip';
import { useUsers } from '../../lib/users';
import { useTaskMutations } from './api';

export type TaskFormSeed = { mode: 'create' } | { mode: 'edit'; task: Task };

export function TaskFormModal({
  seed,
  onClose,
}: {
  seed: TaskFormSeed;
  onClose: () => void;
}) {
  const users = useUsers();
  const { create, patch, remove } = useTaskMutations();
  const editing = seed.mode === 'edit' ? seed.task : null;

  const [title, setTitle] = useState(editing?.title ?? '');
  const [userId, setUserId] = useState<string | null>(editing?.userId ?? null);
  const [category, setCategory] = useState(editing?.category ?? '');
  const [dueKey, setDueKey] = useState(editing?.dueKey ?? '');
  const [schedule, setSchedule] = useState<Schedule>(editing?.schedule ?? 'none');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    const payload = {
      title: title.trim(),
      userId,
      category: category.trim(),
      // Recurring tasks anchor at their due date (or today).
      dueKey: dueKey || (schedule !== 'none' ? todayKey() : null),
      schedule,
      notes: notes.trim(),
    };
    if (editing) patch.mutate({ id: editing.id, ...payload }, { onSuccess: onClose });
    else create.mutate(payload, { onSuccess: onClose });
  };

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal panel" onPointerDown={(e) => e.stopPropagation()}>
        <h3>{editing ? 'Edit to-do' : 'New to-do'}</h3>
        <div className="field">
          <label htmlFor="task-title">What</label>
          <input
            id="task-title"
            className="input"
            value={title}
            autoFocus
            placeholder="e.g. Call the plumber"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Who (optional)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn${userId === null ? ' btn-primary' : ''}`}
              onClick={() => setUserId(null)}
            >
              Anyone
            </button>
            {users.map((u) => (
              <MemberChip
                key={u.id}
                user={u}
                size={44}
                selected={userId === u.id}
                onClick={() => setUserId(userId === u.id ? null : u.id)}
              />
            ))}
          </div>
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="task-due">Due date (optional)</label>
            <input
              id="task-due"
              type="date"
              className="input"
              value={dueKey}
              onChange={(e) => setDueKey(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="task-repeat">Repeats</label>
            <select
              id="task-repeat"
              className="input"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as Schedule)}
            >
              {SCHEDULES.map((s) => (
                <option key={s} value={s}>
                  {SCHEDULE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="task-cat">Category (optional)</label>
          <input
            id="task-cat"
            className="input"
            list="task-categories"
            placeholder="e.g. Home, School, Errands"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id="task-categories">
            <option value="Home" />
            <option value="School" />
            <option value="Errands" />
            <option value="Work" />
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="task-notes">Notes (optional)</label>
          <textarea
            id="task-notes"
            className="input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
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
          <button className="btn btn-primary" disabled={title.trim() === ''} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
