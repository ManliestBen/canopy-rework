import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BackupSchema } from '@canopy/shared';
import { useRef, useState } from 'react';
import { z } from 'zod';
import { apiSend } from '../lib/api';

const RestoreResultSchema = z.object({ ok: z.literal(true), restoredUsers: z.number() });

/** Download a config backup; restore from a previously saved file. */
export function BackupSettings() {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const restore = useMutation({
    mutationFn: async (file: File) => {
      const parsed = BackupSchema.parse(JSON.parse(await file.text()));
      return apiSend(RestoreResultSchema, 'POST', '/api/backup/restore', parsed);
    },
    onSuccess: (result) => {
      setMessage(`Restored settings and ${result.restoredUsers} family member(s) ✓`);
      qc.invalidateQueries();
    },
    onError: (err) =>
      setMessage(
        err instanceof z.ZodError || err instanceof SyntaxError
          ? 'That file is not a Canopy backup.'
          : err.message,
      ),
  });

  return (
    <div>
      <p className="muted">
        Backups contain settings and family members — no PINs and no Google keys, so
        the file is safe to store anywhere.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <a className="btn" href="/api/backup" download>
          Download backup
        </a>
        <button className="btn" onClick={() => fileInput.current?.click()}>
          Restore from file…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) restore.mutate(file);
            e.target.value = '';
          }}
        />
      </div>
      {message && <p style={{ fontWeight: 700 }}>{message}</p>}
    </div>
  );
}
