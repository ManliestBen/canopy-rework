import fs from 'node:fs';
import { Binary, MongoClient, type Collection } from 'mongodb';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { closeDb, getDb, openDb } from '../db/index.js';

/**
 * Cloud backup: a one-way mirror of the SQLite database to MongoDB. SQLite
 * stays the single source of truth (offline-first is preserved); the cloud
 * just receives full snapshots — daily on a timer and on demand from
 * Settings — for disaster recovery and so a future companion app could read
 * a copy. Best-effort: if the cloud is unreachable the panel keeps working.
 */
const COLLECTION = 'canopy_backups';
const KEEP_SNAPSHOTS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SnapshotMeta = {
  createdAt: Date;
  size: number;
  userVersion: number;
};

export type Snapshot = SnapshotMeta & { data: Buffer };

/** Storage backend for snapshots — Mongo in production, a fake in tests. */
export interface SnapshotStore {
  save(snapshot: Snapshot): Promise<void>;
  list(): Promise<SnapshotMeta[]>; // newest first, metadata only
  latest(): Promise<Snapshot | null>;
  prune(keep: number): Promise<number>;
}

class MongoSnapshotStore implements SnapshotStore {
  private client: MongoClient;
  private connected = false;

  constructor(uri: string) {
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  }

  private async collection(): Promise<Collection> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
    return this.client.db().collection(COLLECTION);
  }

  async save(snapshot: Snapshot): Promise<void> {
    const coll = await this.collection();
    await coll.insertOne({
      kind: 'canopy-db-snapshot',
      createdAt: snapshot.createdAt,
      size: snapshot.size,
      userVersion: snapshot.userVersion,
      data: new Binary(snapshot.data),
    });
  }

  async list(): Promise<SnapshotMeta[]> {
    const coll = await this.collection();
    const docs = await coll
      .find({}, { projection: { data: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map((d) => ({
      createdAt: d.createdAt as Date,
      size: d.size as number,
      userVersion: d.userVersion as number,
    }));
  }

  async latest(): Promise<Snapshot | null> {
    const coll = await this.collection();
    const doc = await coll.find({}).sort({ createdAt: -1 }).limit(1).next();
    if (!doc) return null;
    const bin = doc.data as Binary;
    return {
      createdAt: doc.createdAt as Date,
      size: doc.size as number,
      userVersion: doc.userVersion as number,
      data: Buffer.from(bin.buffer),
    };
  }

  async prune(keep: number): Promise<number> {
    const coll = await this.collection();
    const keepIds = await coll
      .find({}, { projection: { _id: 1 } })
      .sort({ createdAt: -1 })
      .limit(keep)
      .toArray();
    const result = await coll.deleteMany({ _id: { $nin: keepIds.map((d) => d._id) } });
    return result.deletedCount ?? 0;
  }

  async close(): Promise<void> {
    if (this.connected) await this.client.close();
  }
}

let store: SnapshotStore | null = null;
let mongoStore: MongoSnapshotStore | null = null;
let timer: NodeJS.Timeout | null = null;

/** Test seam: inject a fake store (avoids a real MongoDB connection). */
export function __setStoreForTests(s: SnapshotStore | null): void {
  store = s;
}

export function cloudBackupConfigured(): boolean {
  return store !== null || config.cloudBackup.mongodbUri !== null;
}

function getStore(): SnapshotStore {
  if (store) return store;
  const uri = config.cloudBackup.mongodbUri;
  if (!uri) {
    throw Object.assign(new Error('Cloud backup is not configured'), { status: 503 });
  }
  if (!mongoStore) mongoStore = new MongoSnapshotStore(uri);
  store = mongoStore;
  return store;
}

/** Serialize the live database into a consistent snapshot buffer. */
function snapshotDatabase(): Snapshot {
  const db = getDb();
  const data = db.serialize();
  const userVersion = db.pragma('user_version', { simple: true }) as number;
  return { createdAt: new Date(), size: data.byteLength, userVersion, data };
}

/** Take a snapshot and push it to the cloud, pruning old snapshots. */
export async function runCloudBackup(): Promise<SnapshotMeta> {
  const s = getStore();
  const snapshot = snapshotDatabase();
  await s.save(snapshot);
  const pruned = await s.prune(KEEP_SNAPSHOTS);
  logger.info(
    { size: snapshot.size, pruned },
    'cloud backup complete',
  );
  const { data: _data, ...meta } = snapshot;
  void _data;
  return meta;
}

export async function cloudBackupStatus(): Promise<{
  configured: boolean;
  lastBackupAt: Date | null;
  count: number;
}> {
  if (!cloudBackupConfigured()) return { configured: false, lastBackupAt: null, count: 0 };
  const list = await getStore().list();
  return {
    configured: true,
    lastBackupAt: list[0]?.createdAt ?? null,
    count: list.length,
  };
}

/**
 * Replace the live database with the most recent cloud snapshot. The current
 * database is copied to a .bak file first. Destructive — the caller (UI)
 * must confirm.
 */
export async function restoreFromCloud(dbPath: string = config.dbPath): Promise<{
  restoredFrom: Date;
}> {
  const snapshot = await getStore().latest();
  if (!snapshot) {
    throw Object.assign(new Error('No cloud backup to restore from'), { status: 404 });
  }

  // Validate the snapshot really is a Canopy database before we swap it in.
  const { default: Database } = await import('better-sqlite3');
  const probe = new Database(snapshot.data);
  try {
    const row = probe
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .get();
    if (!row) {
      throw Object.assign(new Error('Cloud backup is not a valid Canopy database'), {
        status: 422,
      });
    }
  } finally {
    probe.close();
  }

  closeDb();
  // Safety copy of whatever is there now, then swap in the snapshot.
  if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, `${dbPath}.bak`);
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(dbPath + suffix)) fs.rmSync(dbPath + suffix);
  }
  fs.writeFileSync(dbPath, snapshot.data, { mode: 0o600 });
  openDb(dbPath); // re-open (and migrate if the snapshot predates a schema bump)

  logger.info({ restoredFrom: snapshot.createdAt }, 'restored database from cloud backup');
  return { restoredFrom: snapshot.createdAt };
}

export function startCloudBackupScheduler(): void {
  if (timer || !cloudBackupConfigured()) return;
  timer = setInterval(() => {
    runCloudBackup().catch((err) =>
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'scheduled cloud backup failed'),
    );
  }, DAY_MS);
  timer.unref();
}

export function stopCloudBackupScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
