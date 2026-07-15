import {
  SCHEDULE_LABELS,
  formatKey,
  occursOn,
  todayKey as computeTodayKey,
  type Task,
} from '@canopy/shared';
import { useMemo, useState } from 'react';
import { MemberChip } from '../../components/MemberChip';
import { useNow } from '../../hooks/useNow';
import { useUsers } from '../../lib/users';
import { TaskFormModal, type TaskFormSeed } from './TaskFormModal';
import { useTaskMutations, useTasks } from './api';
import './household.css';

type Bucket = 'overdue' | 'today' | 'upcoming' | 'someday' | 'done';

function bucketFor(task: Task, todayKey: string): Bucket {
  if (task.schedule !== 'none') {
    if (!occursOn(task.schedule, task.dueKey, todayKey)) return 'upcoming';
    return task.completedKeys.includes(todayKey) ? 'done' : 'today';
  }
  if (task.completedAt) return 'done';
  if (!task.dueKey) return 'someday';
  if (task.dueKey < todayKey) return 'overdue';
  if (task.dueKey === todayKey) return 'today';
  return 'upcoming';
}

const BUCKET_TITLES: Record<Bucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  upcoming: 'Coming up',
  someday: 'Someday',
  done: 'Done',
};

export function TasksPage() {
  useNow();
  const todayKey = computeTodayKey();
  const users = useUsers();
  const { data: tasks = [] } = useTasks();
  const { toggle } = useTaskMutations();
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskFormSeed | null>(null);
  const [showDone, setShowDone] = useState(false);

  const buckets = useMemo(() => {
    const filtered = filterUserId
      ? tasks.filter((t) => t.userId === filterUserId || t.userId === null)
      : tasks;
    const map: Record<Bucket, Task[]> = {
      overdue: [],
      today: [],
      upcoming: [],
      someday: [],
      done: [],
    };
    for (const t of filtered) map[bucketFor(t, todayKey)].push(t);
    map.overdue.sort((a, b) => (a.dueKey ?? '').localeCompare(b.dueKey ?? ''));
    map.upcoming.sort((a, b) => (a.dueKey ?? '9999').localeCompare(b.dueKey ?? '9999'));
    return map;
  }, [tasks, filterUserId, todayKey]);

  const renderTask = (task: Task) => {
    const user = users.find((u) => u.id === task.userId);
    const done = bucketFor(task, todayKey) === 'done';
    return (
      <div key={task.id} className={`task-row${done ? ' done' : ''}`}>
        <button
          type="button"
          className={`chore-check${done ? ' checked' : ''}`}
          aria-label={done ? 'Mark not done' : 'Mark done'}
          onClick={() =>
            toggle.mutate({
              id: task.id,
              dateKey: task.schedule === 'none' ? null : todayKey,
            })
          }
        >
          {done ? '✓' : ''}
        </button>
        <button type="button" className="task-row-main" onClick={() => setForm({ mode: 'edit', task })}>
          <span className="task-row-title">{task.title}</span>
          <span className="task-row-sub muted">
            {task.schedule !== 'none' && `↻ ${SCHEDULE_LABELS[task.schedule]} `}
            {task.dueKey &&
              task.schedule === 'none' &&
              `· due ${formatKey(task.dueKey, 'EEE, MMM d')} `}
            {task.category && `· ${task.category}`}
          </span>
        </button>
        {user && <MemberChip user={user} size={30} />}
      </div>
    );
  };

  return (
    <div>
      <div className="cal-toolbar">
        <h1 className="page-title" style={{ margin: 0 }}>
          To-Dos
        </h1>
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
      </div>

      {(['overdue', 'today', 'upcoming', 'someday'] as const).map((bucket) =>
        buckets[bucket].length === 0 ? null : (
          <section key={bucket} className="panel task-section">
            <h2 className={`task-section-title${bucket === 'overdue' ? ' overdue' : ''}`}>
              {BUCKET_TITLES[bucket]}
            </h2>
            {buckets[bucket].map(renderTask)}
          </section>
        ),
      )}

      {tasks.length === 0 && (
        <div className="panel cal-empty">
          <p style={{ fontSize: '2rem', margin: 0 }}>✅</p>
          <p className="muted">Nothing on the list. Tap + to add a to-do.</p>
        </div>
      )}

      {buckets.done.length > 0 && (
        <section className="panel task-section">
          <button className="btn btn-ghost" onClick={() => setShowDone(!showDone)}>
            {showDone ? 'Hide' : 'Show'} done ({buckets.done.length})
          </button>
          {showDone && buckets.done.map(renderTask)}
        </section>
      )}

      <button className="fab" aria-label="Add to-do" onClick={() => setForm({ mode: 'create' })}>
        +
      </button>

      {form && <TaskFormModal seed={form} onClose={() => setForm(null)} />}
    </div>
  );
}
