import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OkSchema } from '@canopy/shared';
import { useState } from 'react';
import { apiSend } from '../lib/api';
import { authStatusQuery } from './PinSettings';

/**
 * Gate for remote clients (phones/laptops). The panel itself (loopback)
 * is always let straight through by the server, so this only ever
 * renders away from the wall.
 */
export function PinGate({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { data: status, isLoading } = useQuery(authStatusQuery);
  const [pin, setPin] = useState('');

  const login = useMutation({
    mutationFn: (p: string) => apiSend(OkSchema, 'POST', '/api/auth/login', { pin: p }),
    onSuccess: () => qc.invalidateQueries(),
    onError: () => setPin(''),
  });

  if (isLoading) return null;
  if (!status || status.isPanel || status.authenticated) return <>{children}</>;

  return (
    <div className="onboarding">
      <div className="onboarding-card panel" style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1 className="page-title">Canopy</h1>
        {status.hasPin ? (
          <>
            <p className="muted">Enter the family PIN to continue.</p>
            <input
              className="input"
              style={{ fontSize: '1.6rem', textAlign: 'center', letterSpacing: '0.4em' }}
              inputMode="numeric"
              pattern="\d*"
              maxLength={8}
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pin.length >= 4) login.mutate(pin);
              }}
            />
            {login.isError && (
              <p style={{ color: 'var(--danger)', fontWeight: 700 }}>
                {login.error.message}
              </p>
            )}
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 12 }}
              disabled={pin.length < 4}
              onClick={() => login.mutate(pin)}
            >
              Unlock
            </button>
          </>
        ) : (
          <p className="muted">
            Remote access is off. Set a family PIN on the panel (Settings →
            Security) to use Canopy from this device.
          </p>
        )}
      </div>
    </div>
  );
}
