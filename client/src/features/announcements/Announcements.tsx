import { useState } from 'react';
import { MemberChip } from '../../components/MemberChip';
import { useUsers } from '../../lib/users';
import { useAnnouncementMutations, useAnnouncements, useEmailStatus } from './api';
import './announcements.css';

/** Sticky-note strip shown on the main (calendar) screen. */
export function AnnouncementStrip() {
  const { data: notes = [] } = useAnnouncements();
  const { remove } = useAnnouncementMutations();
  const users = useUsers();

  if (notes.length === 0) return null;
  return (
    <div className="notes-strip">
      {notes.map((note) => {
        const author = users.find((u) => u.id === note.authorId);
        return (
          <div key={note.id} className="note">
            <span className="note-emoji">{note.emoji}</span>
            <span className="note-text">{note.text}</span>
            {author && <MemberChip user={author} size={24} />}
            <button
              type="button"
              className="note-dismiss"
              aria-label="Take down note"
              onClick={() => remove.mutate(note.id)}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Header megaphone: post a note ("Dinner's ready!"). */
export function AnnounceButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost timer-launch"
        aria-label="Post a note"
        onClick={() => setOpen(true)}
      >
        📣
      </button>
      {open && <AnnounceModal onClose={() => setOpen(false)} />}
    </>
  );
}

const EXPIRY_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '4 hours', hours: 4 },
  { label: 'Today', hours: 18 },
  { label: 'Until removed', hours: undefined },
] as const;

const NOTE_EMOJI = ['📌', '🍝', '🎉', '❤️', '🚗', '🧹', '⚠️', '🎂'];

function AnnounceModal({ onClose }: { onClose: () => void }) {
  const users = useUsers();
  const { create } = useAnnouncementMutations();
  const { data: email } = useEmailStatus();
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState('📌');
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<number | undefined>(4);
  const [alsoEmail, setAlsoEmail] = useState(false);

  const canEmail = (email?.configured ?? false) && (email?.recipients.length ?? 0) > 0;

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal panel" onPointerDown={(e) => e.stopPropagation()}>
        <h3>Post a note</h3>
        <div className="field">
          <input
            className="input"
            value={text}
            autoFocus
            maxLength={300}
            placeholder="e.g. Dinner's ready!"
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="field">
          <div className="swatch-row">
            {NOTE_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                className={`swatch swatch-emoji${emoji === e ? ' selected' : ''}`}
                onClick={() => setEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        {users.length > 0 && (
          <div className="field">
            <label>From</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {users.map((u) => (
                <MemberChip
                  key={u.id}
                  user={u}
                  size={40}
                  selected={authorId === u.id}
                  onClick={() => setAuthorId(authorId === u.id ? null : u.id)}
                />
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <label>Stays up for</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {EXPIRY_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                className={`btn${expiry === opt.hours ? ' btn-primary' : ''}`}
                onClick={() => setExpiry(opt.hours)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {canEmail && (
          <div className="field">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={alsoEmail}
                onChange={(e) => setAlsoEmail(e.target.checked)}
              />
              Also email the family
            </label>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={text.trim() === '' || create.isPending}
            onClick={() =>
              create.mutate(
                {
                  text: text.trim(),
                  emoji,
                  authorId,
                  expiresInHours: expiry,
                  alsoEmail: alsoEmail && canEmail,
                },
                { onSuccess: onClose },
              )
            }
          >
            Post it
          </button>
        </div>
      </div>
    </div>
  );
}
