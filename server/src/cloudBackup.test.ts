import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb, openTestDb } from './db/index.js';
import {
  __setStoreForTests,
  cloudBackupConfigured,
  cloudBackupStatus,
  runCloudBackup,
  type Snapshot,
  type SnapshotMeta,
  type SnapshotStore,
} from './services/cloudBackup.js';

/** In-memory stand-in for the MongoDB snapshot store. */
class FakeStore implements SnapshotStore {
  snapshots: Snapshot[] = [];
  async save(s: Snapshot): Promise<void> {
    this.snapshots.push(s);
  }
  async list(): Promise<SnapshotMeta[]> {
    return [...this.snapshots]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(({ data: _d, ...meta }) => meta);
  }
  async latest(): Promise<Snapshot | null> {
    return (
      [...this.snapshots].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }
  async prune(keep: number): Promise<number> {
    const sorted = [...this.snapshots].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const drop = sorted.slice(keep);
    this.snapshots = sorted.slice(0, keep);
    return drop.length;
  }
}

describe('cloud backup', () => {
  let fake: FakeStore;
  beforeEach(() => {
    openTestDb();
    fake = new FakeStore();
    __setStoreForTests(fake);
  });
  afterEach(() => {
    __setStoreForTests(null);
    closeDb();
  });

  it('reports configured when a store is present', () => {
    expect(cloudBackupConfigured()).toBe(true);
  });

  it('snapshots the live database into a valid, restorable image', async () => {
    getDb()
      .prepare("INSERT INTO users (id, name, color, avatar, is_admin, sort_order) VALUES (?, 'Ella', 'pink', '', 0, 0)")
      .run('11111111-1111-4111-8111-111111111111');

    const meta = await runCloudBackup();
    expect(meta.size).toBeGreaterThan(0);
    expect(fake.snapshots).toHaveLength(1);

    // The snapshot bytes must open as a SQLite DB containing the inserted row.
    const restored = new Database(fake.snapshots[0]!.data);
    const user = restored.prepare('SELECT name FROM users').get() as { name: string };
    expect(user.name).toBe('Ella');
    restored.close();
  });

  it('exposes status with the latest backup time and count', async () => {
    await runCloudBackup();
    await runCloudBackup();
    const status = await cloudBackupStatus();
    expect(status.configured).toBe(true);
    expect(status.count).toBe(2);
    expect(status.lastBackupAt).toBeInstanceOf(Date);
  });

  it('prunes to the retention limit', async () => {
    // 20 snapshots with distinct timestamps; retention keeps 14.
    for (let i = 0; i < 20; i++) {
      fake.snapshots.push({
        createdAt: new Date(2026, 0, 1 + i),
        size: 1,
        userVersion: 1,
        data: Buffer.from([0]),
      });
    }
    await runCloudBackup(); // adds one more, then prunes
    expect(fake.snapshots.length).toBe(14);
  });
});
