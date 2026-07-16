import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BackupSchema } from '@canopy/shared';
import { useRef, useState } from 'react';
import { z } from 'zod';
import { apiGet, apiSend } from '../lib/api';

const RestoreResultSchema = z.object({ ok: z.literal(true), restoredUsers: z.number() });

const CloudStatusSchema = z.object({
  configured: z.boolean(),
  lastBackupAt: z.string().nullable(),
  count: z.number(),
});
const CloudBackupResultSchema = z.object({
  ok: z.literal(true),
  createdAt: z.string(),
  size: z.number(),
});
const CloudRestoreResultSchema = z.object({ ok: z.literal(true), restoredFrom: z.string() });

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

/**
 * Cloud backup: a full snapshot of the database saved to MongoDB — daily
 * automatically, or on demand here. Only shown/enabled when a MongoDB
 * connection is configured on the server.
 */
export function CloudBackupSettings() {
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingRestore, setConfirmingRestore] = useState(false);

  const status = useQuery({
    queryKey: ['cloud-backup-status'],
    queryFn: () => apiGet(CloudStatusSchema, '/api/backup/cloud'),
    refetchOnWindowFocus: false,
  });

  const backupNow = useMutation({
    mutationFn: () => apiSend(CloudBackupResultSchema, 'POST', '/api/backup/cloud'),
    onSuccess: (r) => {
      const kb = Math.max(1, Math.round(r.size / 1024));
      setMessage(`Backed up to the cloud ✓ (${kb} KB)`);
      qc.invalidateQueries({ queryKey: ['cloud-backup-status'] });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : 'Backup failed'),
  });

  const restore = useMutation({
    mutationFn: () => apiSend(CloudRestoreResultSchema, 'POST', '/api/backup/cloud/restore'),
    onSuccess: (r) => {
      setConfirmingRestore(false);
      setMessage(`Restored from the cloud backup taken ${new Date(r.restoredFrom).toLocaleString()} ✓`);
      qc.invalidateQueries();
    },
    onError: (err) => {
      setConfirmingRestore(false);
      setMessage(err instanceof Error ? err.message : 'Restore failed');
    },
  });

  if (status.isLoading) return null;

  if (!status.data?.configured) {
    return (
      <div style={{ marginTop: 18 }}>
        <h3 style={{ marginBottom: 4 }}>Cloud backup</h3>
        <p className="muted">
          Not set up. Add a <code>MONGODB_URI</code> on the server to save automatic daily
          snapshots of everything to the cloud. See docs/SETUP_INTEGRATIONS.md.
        </p>
      </div>
    );
  }

  const last = status.data.lastBackupAt;
  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ marginBottom: 4 }}>Cloud backup</h3>
      <p className="muted">
        A full copy of everything (chores, stars, lists, calendars…) is saved to the cloud
        automatically every day. {status.data.count} snapshot(s) stored;{' '}
        {last ? `last backup ${new Date(last).toLocaleString()}.` : 'no backup yet.'}
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" disabled={backupNow.isPending} onClick={() => backupNow.mutate()}>
          {backupNow.isPending ? 'Backing up…' : 'Back up now'}
        </button>
        {!confirmingRestore ? (
          <button
            className="btn"
            disabled={!last || restore.isPending}
            onClick={() => setConfirmingRestore(true)}
          >
            Restore from cloud…
          </button>
        ) : (
          <>
            <button
              className="btn"
              style={{ background: 'var(--danger, #c0392b)', color: 'white' }}
              disabled={restore.isPending}
              onClick={() => restore.mutate()}
            >
              {restore.isPending ? 'Restoring…' : 'Replace all data — confirm'}
            </button>
            <button className="btn" onClick={() => setConfirmingRestore(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
      {message && <p style={{ fontWeight: 700 }}>{message}</p>}
    </div>
  );
}
