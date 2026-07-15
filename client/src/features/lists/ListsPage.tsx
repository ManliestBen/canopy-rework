import type { ListItem, ShoppingList } from '@canopy/shared';
import { useEffect, useMemo, useState } from 'react';
import { MemberChip } from '../../components/MemberChip';
import { useUsers } from '../../lib/users';
import { useFrequentItems, useListMutations, useLists } from './api';
import './lists.css';

export function ListsPage() {
  const { data: lists = [] } = useLists();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [managing, setManaging] = useState<ShoppingList | 'new' | null>(null);

  // Keep a valid active list as lists come and go.
  useEffect(() => {
    if (lists.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!lists.some((l) => l.id === activeId)) setActiveId(lists[0]!.id);
  }, [lists, activeId]);

  const active = lists.find((l) => l.id === activeId) ?? null;

  return (
    <div className="lists-page">
      <div className="cal-toolbar">
        <h1 className="page-title" style={{ margin: 0 }}>
          Lists
        </h1>
        <div className="list-tabs">
          {lists.map((l) => (
            <button
              key={l.id}
              className={`btn${l.id === activeId ? ' btn-primary' : ''}`}
              onClick={() => setActiveId(l.id)}
            >
              {l.emoji && `${l.emoji} `}
              {l.title}
              <span className="list-count">
                {l.items.filter((i) => !i.done).length}
              </span>
            </button>
          ))}
          <button className="btn btn-ghost" onClick={() => setManaging('new')}>
            + New list
          </button>
        </div>
        <div style={{ flex: 1 }} />
        {active && (
          <button className="btn btn-ghost" onClick={() => setManaging(active)}>
            Rename / remove
          </button>
        )}
      </div>

      {lists.length === 0 && (
        <div className="panel cal-empty">
          <p style={{ fontSize: '2rem', margin: 0 }}>🛒</p>
          <p className="muted">Make your first list — Groceries is a classic.</p>
          <button className="btn btn-primary" onClick={() => setManaging('new')}>
            + New list
          </button>
        </div>
      )}

      {active && <ActiveList list={active} />}

      {managing && (
        <ListFormModal
          list={managing === 'new' ? null : managing}
          onClose={() => setManaging(null)}
          onDeleted={() => setActiveId(null)}
        />
      )}
    </div>
  );
}

function ActiveList({ list }: { list: ShoppingList }) {
  const users = useUsers();
  const { addItems, toggleItem, assignItem, removeItem, clearCompleted } =
    useListMutations();
  const { data: frequent = [] } = useFrequentItems(list.id);
  const [draft, setDraft] = useState('');

  const open = useMemo(() => list.items.filter((i) => !i.done), [list.items]);
  const done = useMemo(() => list.items.filter((i) => i.done), [list.items]);

  const add = (text: string) => {
    const t = text.trim();
    if (t === '') return;
    addItems.mutate({ listId: list.id, items: [t] });
    setDraft('');
  };

  return (
    <div className="panel list-panel">
      <div className="list-add-row">
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder={`Add to ${list.title}…`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add(draft);
          }}
        />
        <button className="btn btn-primary" disabled={draft.trim() === ''} onClick={() => add(draft)}>
          Add
        </button>
      </div>

      {frequent.length > 0 && (
        <div className="frequent-row">
          {frequent.slice(0, 10).map((text) => (
            <button key={text} className="btn frequent-chip" onClick={() => add(text)}>
              + {text}
            </button>
          ))}
        </div>
      )}

      <div className="list-items">
        {open.map((item) => (
          <ListRow
            key={item.id}
            item={item}
            users={users}
            onToggle={() => toggleItem.mutate({ itemId: item.id, done: true })}
            onAssign={(assigneeId) => assignItem.mutate({ itemId: item.id, assigneeId })}
            onRemove={() => removeItem.mutate(item.id)}
          />
        ))}
        {open.length === 0 && <p className="muted list-empty">All done here ✨</p>}
      </div>

      {done.length > 0 && (
        <div className="list-done">
          <div className="list-done-head">
            <span className="muted">{done.length} done</span>
            <button className="btn btn-ghost" onClick={() => clearCompleted.mutate(list.id)}>
              Clear completed
            </button>
          </div>
          {done.map((item) => (
            <ListRow
              key={item.id}
              item={item}
              users={users}
              onToggle={() => toggleItem.mutate({ itemId: item.id, done: false })}
              onAssign={(assigneeId) => assignItem.mutate({ itemId: item.id, assigneeId })}
              onRemove={() => removeItem.mutate(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ListRow({
  item,
  users,
  onToggle,
  onAssign,
  onRemove,
}: {
  item: ListItem;
  users: ReturnType<typeof useUsers>;
  onToggle: () => void;
  onAssign: (assigneeId: string | null) => void;
  onRemove: () => void;
}) {
  const assignee = users.find((u) => u.id === item.assigneeId);
  // Tap the chip area to cycle: unassigned → each member → unassigned.
  const cycleAssignee = () => {
    if (users.length === 0) return;
    const idx = users.findIndex((u) => u.id === item.assigneeId);
    const next = idx === -1 ? users[0] : users[idx + 1];
    onAssign(next?.id ?? null);
  };

  return (
    <div className={`list-row${item.done ? ' done' : ''}`}>
      <button
        type="button"
        className={`chore-check${item.done ? ' checked' : ''}`}
        aria-label={item.done ? 'Uncheck' : 'Check off'}
        onClick={onToggle}
      >
        {item.done ? '✓' : ''}
      </button>
      <span className="list-row-text">{item.text}</span>
      <button
        type="button"
        className="list-assignee"
        onClick={cycleAssignee}
        aria-label={assignee ? `Assigned to ${assignee.name}` : 'Assign someone'}
      >
        {assignee ? (
          <MemberChip user={assignee} size={30} />
        ) : (
          <span className="list-assignee-empty">＋</span>
        )}
      </button>
      <button type="button" className="btn btn-ghost" aria-label="Remove item" onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}

function ListFormModal({
  list,
  onClose,
  onDeleted,
}: {
  list: ShoppingList | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { createList, patchList, removeList } = useListMutations();
  const [title, setTitle] = useState(list?.title ?? '');
  const [emoji, setEmoji] = useState(list?.emoji ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const EMOJIS = ['', '🛒', '🏬', '🔨', '🎁', '📦', '💊', '🐕'];

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal panel" onPointerDown={(e) => e.stopPropagation()}>
        <h3>{list ? 'Edit list' : 'New list'}</h3>
        <div className="field">
          <label htmlFor="list-title">Name</label>
          <input
            id="list-title"
            className="input"
            value={title}
            autoFocus
            placeholder="e.g. Groceries, Costco, Hardware"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Emoji</label>
          <div className="swatch-row">
            {EMOJIS.map((e) => (
              <button
                key={e || 'none'}
                type="button"
                className={`swatch swatch-emoji${emoji === e ? ' selected' : ''}`}
                onClick={() => setEmoji(e)}
              >
                {e || '–'}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          {list && !confirmDelete && (
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--danger)' }}
              onClick={() => setConfirmDelete(true)}
            >
              Delete list
            </button>
          )}
          {list && confirmDelete && (
            <button
              className="btn btn-danger"
              onClick={() =>
                removeList.mutate(list.id, {
                  onSuccess: () => {
                    onDeleted();
                    onClose();
                  },
                })
              }
            >
              Really delete?
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={title.trim() === ''}
            onClick={() => {
              if (list) patchList.mutate({ id: list.id, title: title.trim(), emoji });
              else createList.mutate({ title: title.trim(), emoji });
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
