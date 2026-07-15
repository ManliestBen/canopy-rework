import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthStatusSchema, OkSchema } from '@canopy/shared';
import { useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

export const authStatusQuery = {
  queryKey: ['auth-status'] as const,
  queryFn: () => apiGet(AuthStatusSchema, '/api/auth/status'),
};

/** Set or change the family PIN that guards remote (phone/laptop) access. */
export function PinSettings() {
  const qc = useQueryClient();
  const { data: status } = useQuery(authStatusQuery);
  const [pin, setPin] = useState('');
  const [saved, setSaved] = useState(false);

  const setPinMutation = useMutation({
    mutationFn: (newPin: string) =>
      apiSend(OkSchema, 'POST', '/api/auth/pin', { newPin }),
    onSuccess: () => {
      setPin('');
      setSaved(true);
      qc.invalidateQueries({ queryKey: authStatusQuery.queryKey });
      setTimeout(() => setSaved(false), 3000);
    },
  });

  return (
    <div>
      <p className="muted">
        {status?.hasPin
          ? 'A family PIN is set. Phones and laptops on your network must enter it to use Canopy.'
          : 'No PIN yet — only this panel can use Canopy. Set a PIN to allow phones and laptops to connect.'}
      </p>
      <div style={{ display: 'flex', gap: 10, maxWidth: 360 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          inputMode="numeric"
          pattern="\d*"
          maxLength={8}
          placeholder={status?.hasPin ? 'New PIN (4–8 digits)' : 'PIN (4–8 digits)'}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
        <button
          className="btn btn-primary"
          disabled={pin.length < 4}
          onClick={() => setPinMutation.mutate(pin)}
        >
          {status?.hasPin ? 'Change PIN' : 'Set PIN'}
        </button>
      </div>
      {saved && <p style={{ color: 'var(--success)', fontWeight: 800 }}>PIN saved ✓</p>}
      {setPinMutation.isError && (
        <p style={{ color: 'var(--danger)' }}>{setPinMutation.error.message}</p>
      )}
    </div>
  );
}
