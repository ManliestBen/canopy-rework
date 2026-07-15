import { useMutation } from '@tanstack/react-query';
import { OkSchema } from '@canopy/shared';
import { useState } from 'react';
import { apiSend } from '../lib/api';
import { useSettings } from '../theme/ThemeProvider';

/**
 * When "lock Settings" is on, opening Settings on the panel asks for
 * the family PIN — so kids can't change themes, users, or the PIN
 * itself. Unlock lasts for the visit (component lifetime).
 */
export function SettingsLock({ children }: { children: React.ReactNode }) {
  const settings = useSettings();
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');

  const verify = useMutation({
    mutationFn: (p: string) => apiSend(OkSchema, 'POST', '/api/auth/verify', { pin: p }),
    onSuccess: () => setUnlocked(true),
    onError: () => setPin(''),
  });

  if (!settings.settingsLocked || unlocked) return <>{children}</>;

  return (
    <div style={{ maxWidth: 420, margin: '10vh auto', textAlign: 'center' }}>
      <div className="panel" style={{ padding: 28 }}>
        <p style={{ fontSize: '2rem', margin: 0 }}>🔒</p>
        <h2>Settings are locked</h2>
        <input
          className="input"
          style={{ fontSize: '1.4rem', textAlign: 'center', letterSpacing: '0.4em' }}
          inputMode="numeric"
          pattern="\d*"
          maxLength={8}
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && pin.length >= 4) verify.mutate(pin);
          }}
        />
        {verify.isError && (
          <p style={{ color: 'var(--danger)', fontWeight: 700 }}>{verify.error.message}</p>
        )}
        <button
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 12 }}
          disabled={pin.length < 4 || verify.isPending}
          onClick={() => verify.mutate(pin)}
        >
          Unlock
        </button>
      </div>
    </div>
  );
}
