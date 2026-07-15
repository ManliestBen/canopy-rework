import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Visual countdown timer ("10 minutes until we leave!") — full-screen
 * ring, launched from the header. Chimes when done; tap to dismiss.
 */
export function TimerButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost timer-launch"
        aria-label="Countdown timer"
        onClick={() => setOpen(true)}
      >
        ⏱
      </button>
      {open && <TimerOverlay onClose={() => setOpen(false)} />}
    </>
  );
}

const PRESETS = [1, 5, 10, 15, 30];

function beep(times: number) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.5;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.45);
    }
  } catch {
    // No audio available — the visual flash still happens.
  }
}

function TimerOverlay({ onClose }: { onClose: () => void }) {
  const [totalSec, setTotalSec] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const endAt = useRef<number>(0);

  const start = useCallback((minutes: number) => {
    const secs = Math.round(minutes * 60);
    setTotalSec(secs);
    setRemaining(secs);
    setPaused(false);
    setFinished(false);
    endAt.current = Date.now() + secs * 1000;
  }, []);

  useEffect(() => {
    if (totalSec === null || paused || finished) return;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setFinished(true);
        beep(6);
      }
    }, 250);
    return () => clearInterval(tick);
  }, [totalSec, paused, finished]);

  const togglePause = () => {
    if (paused) {
      endAt.current = Date.now() + remaining * 1000;
      setPaused(false);
    } else {
      setPaused(true);
    }
  };

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const progress = totalSec ? remaining / totalSec : 0;
  const R = 130;
  const CIRC = 2 * Math.PI * R;

  return (
    <div
      className={`timer-overlay${finished ? ' finished' : ''}`}
      onPointerDown={finished ? onClose : undefined}
    >
      {totalSec === null ? (
        <div className="timer-setup panel">
          <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>Timer</h2>
          <div className="timer-presets">
            {PRESETS.map((m) => (
              <button key={m} className="btn btn-primary timer-preset" onClick={() => start(m)}>
                {m} min
              </button>
            ))}
          </div>
          <CustomMinutes onStart={start} />
          <button className="btn btn-ghost" onClick={onClose}>
            Never mind
          </button>
        </div>
      ) : (
        <div className="timer-running">
          <svg width="300" height="300" viewBox="0 0 300 300" aria-hidden="true">
            <circle cx="150" cy="150" r={R} fill="none" stroke="var(--border-hairline)" strokeWidth="14" />
            <circle
              cx="150"
              cy="150"
              r={R}
              fill="none"
              stroke={finished ? 'var(--danger)' : 'var(--accent)'}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - progress)}
              transform="rotate(-90 150 150)"
              style={{ transition: 'stroke-dashoffset 0.3s linear' }}
            />
          </svg>
          <div className="timer-digits">
            {finished ? "Time's up!" : `${mins}:${String(secs).padStart(2, '0')}`}
          </div>
          <div className="timer-actions">
            {!finished && (
              <button className="btn" onClick={togglePause}>
                {paused ? 'Resume' : 'Pause'}
              </button>
            )}
            <button className="btn btn-danger" onClick={onClose}>
              {finished ? 'Done' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomMinutes({ onStart }: { onStart: (m: number) => void }) {
  const [value, setValue] = useState('');
  const minutes = Number(value);
  return (
    <div style={{ display: 'flex', gap: 8, margin: '4px 0 12px' }}>
      <input
        className="input"
        type="number"
        min={1}
        max={180}
        placeholder="Custom minutes"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ flex: 1 }}
      />
      <button
        className="btn"
        disabled={!Number.isFinite(minutes) || minutes < 1 || minutes > 180}
        onClick={() => onStart(minutes)}
      >
        Start
      </button>
    </div>
  );
}
