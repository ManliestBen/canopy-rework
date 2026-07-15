import {
  SCHEDULE_LABELS,
  addDaysToKey,
  formatKey,
  todayKey as computeTodayKey,
  type Chore,
  type DateKey,
} from '@canopy/shared';
import { useMemo, useState } from 'react';
import { MemberChip } from '../../components/MemberChip';
import { useNow } from '../../hooks/useNow';
import { useUsers } from '../../lib/users';
import { ChoreFormModal, type ChoreFormSeed } from './ChoreFormModal';
import { useChoreDay, useChoreMutations } from './api';
import './household.css';

/** The Skylight chore chart: one column per family member, tap to check. */
export function ChoresPage() {
  useNow(); // midnight rollover
  const todayKey = computeTodayKey();
  const [dateKey, setDateKey] = useState<DateKey>(todayKey);
  const [form, setForm] = useState<ChoreFormSeed | null>(null);

  const users = useUsers();
  const { data } = useChoreDay(dateKey);
  const { toggle } = useChoreMutations(dateKey);

  const byUser = useMemo(() => {
    const map = new Map<string, (Chore & { done: boolean })[]>();
    for (const u of users) map.set(u.id, []);
    for (const chore of data?.chores ?? []) {
      map.get(chore.userId)?.push(chore);
    }
    return map;
  }, [users, data]);

  return (
    <div className="chores-page">
      <div className="cal-toolbar">
        <h1 className="page-title" style={{ margin: 0 }}>
          {dateKey === todayKey ? 'Today' : formatKey(dateKey, 'EEEE, MMM d')}
        </h1>
        <div className="cal-nav">
          <button className="btn" onClick={() => setDateKey(addDaysToKey(dateKey, -1))}>
            ‹
          </button>
          <button className="btn" onClick={() => setDateKey(todayKey)}>
            Today
          </button>
          <button className="btn" onClick={() => setDateKey(addDaysToKey(dateKey, 1))}>
            ›
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => setForm({ mode: 'create' })}>
          + Add chore
        </button>
      </div>

      {users.length === 0 ? (
        <div className="panel cal-empty">
          <p className="muted">Add family members in Settings to start the chore chart.</p>
        </div>
      ) : (
        <div className="chore-columns">
          {users.map((user) => {
            const chores = byUser.get(user.id) ?? [];
            const done = chores.filter((c) => c.done).length;
            return (
              <div
                key={user.id}
                className="chore-column"
                style={{
                  background: `color-mix(in srgb, var(--family-${user.color}) 10%, var(--bg-panel))`,
                }}
              >
                <div className="chore-column-head">
                  <MemberChip user={user} size={40} />
                  <div className="chore-column-name">
                    <span>{user.name}</span>
                    <span className="muted chore-count">
                      {chores.length === 0 ? '—' : `${done}/${chores.length}`}
                    </span>
                  </div>
                </div>
                {chores.length > 0 && (
                  <div className="chore-progress">
                    <div
                      className="chore-progress-fill"
                      style={{
                        width: `${(done / chores.length) * 100}%`,
                        background: `var(--family-${user.color})`,
                      }}
                    />
                  </div>
                )}
                <div className="chore-pills">
                  {chores.map((chore) => (
                    <div
                      key={chore.id}
                      className={`chore-pill${chore.done ? ' done' : ''}`}
                      style={{ background: `var(--pastel-${user.color})` }}
                    >
                      <button
                        type="button"
                        className="chore-pill-main"
                        onClick={() =>
                          setForm({ mode: 'edit', chore })
                        }
                      >
                        <span className="chore-pill-title">
                          {chore.icon && <span>{chore.icon} </span>}
                          {chore.title}
                        </span>
                        <span className="chore-pill-sub">
                          {SCHEDULE_LABELS[chore.schedule]}
                          {chore.points > 1 ? ` · ${chore.points}⭐` : ' · 1⭐'}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`chore-check${chore.done ? ' checked' : ''}`}
                        aria-label={chore.done ? 'Mark not done' : 'Mark done'}
                        onClick={() => toggle.mutate(chore.id)}
                      >
                        {chore.done ? '✓' : ''}
                      </button>
                    </div>
                  ))}
                  {chores.length === 0 && (
                    <p className="muted chore-none">No chores today 🎉</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && <ChoreFormModal seed={form} dateKey={dateKey} onClose={() => setForm(null)} />}
    </div>
  );
}
