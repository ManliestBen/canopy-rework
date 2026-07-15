import { FAMILY_COLORS, type FamilyColor, type User } from '@canopy/shared';
import { useState } from 'react';
import { useUserMutations, useUsers } from '../lib/users';
import { MemberChip } from './MemberChip';

const AVATAR_SUGGESTIONS = ['', '🦄', '🦖', '🐻', '🦊', '🐸', '🚀', '⚽', '🎨', '🎸', '🌵', '🍕'];

/** Add/edit/remove family members. Used in Settings and Onboarding. */
export function UserManager() {
  const users = useUsers();
  const { create, patch, remove } = useUserMutations();
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  return (
    <div>
      <div className="user-rows">
        {users.map((user) => (
          <div key={user.id} className="user-row">
            <MemberChip user={user} size={44} />
            <div className="user-row-name">
              {user.name}
              {user.isAdmin && <span className="muted"> · admin</span>}
            </div>
            <button className="btn btn-ghost" onClick={() => setEditing(user)}>
              Edit
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(user)}>
              Remove
            </button>
          </div>
        ))}
        {users.length === 0 && <p className="muted">No family members yet.</p>}
      </div>
      <button className="btn btn-primary" onClick={() => setEditing('new')}>
        + Add family member
      </button>

      {editing && (
        <UserForm
          user={editing === 'new' ? null : editing}
          takenColors={users
            .filter((u) => editing === 'new' || u.id !== editing.id)
            .map((u) => u.color)}
          onCancel={() => setEditing(null)}
          onSave={(values) => {
            if (editing === 'new') create.mutate(values);
            else patch.mutate({ id: editing.id, ...values });
            setEditing(null);
          }}
        />
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onPointerDown={() => setConfirmDelete(null)}>
          <div className="modal panel" onPointerDown={(e) => e.stopPropagation()}>
            <h3>Remove {confirmDelete.name}?</h3>
            <p className="muted">
              Their chores and tasks will stay but lose their assignee.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmDelete(null)}>
                Keep
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  remove.mutate(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserForm({
  user,
  takenColors,
  onSave,
  onCancel,
}: {
  user: User | null;
  takenColors: string[];
  onSave: (values: { name: string; color: FamilyColor; avatar: string }) => void;
  onCancel: () => void;
}) {
  const firstFree =
    FAMILY_COLORS.find((c) => !takenColors.includes(c)) ?? FAMILY_COLORS[0];
  const [name, setName] = useState(user?.name ?? '');
  const [color, setColor] = useState<FamilyColor>(user?.color ?? firstFree);
  const [avatar, setAvatar] = useState(user?.avatar ?? '');

  return (
    <div className="modal-backdrop" onPointerDown={onCancel}>
      <div className="modal panel" onPointerDown={(e) => e.stopPropagation()}>
        <h3>{user ? `Edit ${user.name}` : 'New family member'}</h3>
        <div className="field">
          <label htmlFor="member-name">Name</label>
          <input
            id="member-name"
            className="input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Harper"
          />
        </div>
        <div className="field">
          <label>Color</label>
          <div className="swatch-row">
            {FAMILY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${color === c ? ' selected' : ''}`}
                style={{ background: `var(--family-${c})` }}
                onClick={() => setColor(c)}
                aria-label={c}
              />
            ))}
          </div>
        </div>
        <div className="field">
          <label>Avatar</label>
          <div className="swatch-row">
            {AVATAR_SUGGESTIONS.map((a) => (
              <button
                key={a || 'initial'}
                type="button"
                className={`swatch swatch-emoji${avatar === a ? ' selected' : ''}`}
                onClick={() => setAvatar(a)}
              >
                {a || (name.charAt(0).toUpperCase() || 'A')}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={name.trim() === ''}
            onClick={() => onSave({ name: name.trim(), color, avatar })}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
