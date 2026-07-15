import { useState } from 'react';
import { MemberChip } from '../../components/MemberChip';
import { useUsers } from '../../lib/users';
import { useRedeem, useRewards } from './api';
import './household.css';

export function RewardsPage() {
  const users = useUsers();
  const { data } = useRewards();
  const [redeeming, setRedeeming] = useState<string | null>(null);

  return (
    <div>
      <h1 className="page-title">Rewards</h1>
      <div className="reward-cards">
        {users.map((user) => {
          const stats = data?.users.find((u) => u.userId === user.id);
          return (
            <div
              key={user.id}
              className="reward-card panel"
              style={{
                background: `color-mix(in srgb, var(--family-${user.color}) 10%, var(--bg-panel))`,
              }}
            >
              <div className="reward-card-head">
                <MemberChip user={user} size={48} />
                <span className="reward-card-name">{user.name}</span>
              </div>
              <div className="reward-balance">
                <span className="reward-stars">⭐</span>
                <span className="reward-number">{stats?.balance ?? 0}</span>
              </div>
              <p className="muted" style={{ margin: '0 0 12px' }}>
                {stats?.earnedThisWeek ?? 0} earned this week ·{' '}
                {stats?.earnedTotal ?? 0} all time
              </p>
              <button
                className="btn btn-primary"
                disabled={(stats?.balance ?? 0) <= 0}
                onClick={() => setRedeeming(user.id)}
              >
                Spend stars
              </button>
            </div>
          );
        })}
        {users.length === 0 && (
          <p className="muted">Add family members in Settings first.</p>
        )}
      </div>

      {data && data.recentRedemptions.length > 0 && (
        <section className="panel" style={{ padding: 18, marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>Recently spent</h2>
          {data.recentRedemptions.map((r) => {
            const user = users.find((u) => u.id === r.userId);
            return (
              <div key={r.id} className="redemption-row">
                {user && <MemberChip user={user} size={28} />}
                <span style={{ flex: 1 }}>
                  {r.note || 'Reward'}
                  <span className="muted">
                    {' '}
                    · {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </span>
                <b>−{r.points} ⭐</b>
              </div>
            );
          })}
        </section>
      )}

      {redeeming && (
        <RedeemModal
          userId={redeeming}
          balance={data?.users.find((u) => u.userId === redeeming)?.balance ?? 0}
          onClose={() => setRedeeming(null)}
        />
      )}
    </div>
  );
}

function RedeemModal({
  userId,
  balance,
  onClose,
}: {
  userId: string;
  balance: number;
  onClose: () => void;
}) {
  const redeem = useRedeem();
  const [points, setPoints] = useState(Math.min(5, balance));
  const [note, setNote] = useState('');

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal panel" onPointerDown={(e) => e.stopPropagation()}>
        <h3>Spend stars</h3>
        <div className="field">
          <label htmlFor="redeem-points">How many? (has {balance} ⭐)</label>
          <input
            id="redeem-points"
            type="number"
            className="input"
            min={1}
            max={balance}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="redeem-note">For what?</label>
          <input
            id="redeem-note"
            className="input"
            placeholder="e.g. Movie night pick, ice cream"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={points < 1 || points > balance || redeem.isPending}
            onClick={() =>
              redeem.mutate({ userId, points, note: note.trim() }, { onSuccess: onClose })
            }
          >
            Spend {points} ⭐
          </button>
        </div>
      </div>
    </div>
  );
}
