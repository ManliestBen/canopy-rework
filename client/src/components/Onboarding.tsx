import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SettingsSchema, type SettingsPatch } from '@canopy/shared';
import { useState } from 'react';
import { apiSend } from '../lib/api';
import { useUsers } from '../lib/users';
import { settingsQuery } from '../theme/ThemeProvider';
import { UserManager } from './UserManager';

/**
 * First-run wizard (feature list: add first user + location during
 * setup; calendars and sleep/wake can be configured later). Shown as a
 * full-screen overlay until completed.
 */
export function Onboarding() {
  const users = useUsers();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [familyName, setFamilyName] = useState('');
  const [location, setLocation] = useState('');

  const save = useMutation({
    mutationFn: (patch: SettingsPatch) =>
      apiSend(SettingsSchema, 'PATCH', '/api/settings', patch),
    onSettled: () => qc.invalidateQueries({ queryKey: settingsQuery.queryKey }),
  });

  const steps = [
    {
      title: 'Welcome to Canopy 🌳',
      body: (
        <>
          <p>
            Your family's calendar, chores, meals, lists, and photos — all in one
            place on the wall.
          </p>
          <p className="muted">This takes about a minute.</p>
        </>
      ),
      canNext: true,
      onNext: () => setStep(1),
    },
    {
      title: 'What should we call your family?',
      body: (
        <input
          className="input"
          style={{ fontSize: '1.3rem' }}
          placeholder="e.g. The Manley Family"
          value={familyName}
          autoFocus
          onChange={(e) => setFamilyName(e.target.value)}
        />
      ),
      canNext: familyName.trim().length > 0,
      onNext: () => {
        save.mutate({ familyName: familyName.trim() });
        setStep(2);
      },
    },
    {
      title: 'Who lives here?',
      body: (
        <>
          <p className="muted">
            Each person gets a color — you'll see it on their events, chores, and
            lists. You can add more people later in Settings.
          </p>
          <UserManager />
        </>
      ),
      canNext: users.length > 0,
      onNext: () => setStep(3),
    },
    {
      title: 'Where are you?',
      body: (
        <>
          <p className="muted">
            Used for the weather forecast. Optional — you can set it later in
            Settings.
          </p>
          <input
            className="input"
            placeholder="e.g. Traverse City, MI"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </>
      ),
      canNext: true,
      onNext: () => {
        save.mutate({ locationQuery: location.trim(), onboarded: true });
      },
    },
  ] as const;

  const current = steps[step] ?? steps[0];
  const isLast = step === steps.length - 1;

  return (
    <div className="onboarding">
      <div className="onboarding-card panel">
        <div className="onboarding-progress">
          {steps.map((_, i) => (
            <span key={i} className={`dot${i <= step ? ' filled' : ''}`} />
          ))}
        </div>
        <h1 className="page-title">{current.title}</h1>
        <div className="onboarding-body">{current.body}</div>
        <div className="onboarding-actions">
          {step > 0 && (
            <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            className="btn btn-primary"
            disabled={!current.canNext}
            onClick={current.onNext}
          >
            {isLast ? 'Start using Canopy' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
