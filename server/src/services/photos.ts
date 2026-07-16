import type { PhotosResponse } from '@canopy/shared';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { logger } from '../logger.js';
import { getSettings } from './settings.js';

/**
 * Cloudinary-backed slideshow photos (feature-list decision: Cloudinary
 * over Google Photos). Uses the Admin REST API directly — no SDK needed
 * for listing. Same last-good cache pattern as calendars/weather.
 */
const REFRESH_INTERVAL_MS = 30 * 60_000;
const TIMEOUT_MS = 15_000;
const CACHE_KEY = 'photos';
const MAX_PHOTOS = 200;

type CloudinaryCreds = { cloudName: string; apiKey: string; apiSecret: string };

export function parseCloudinaryUrl(url: string): CloudinaryCreds | null {
  // cloudinary://<api_key>:<api_secret>@<cloud_name>
  const match = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url);
  if (!match) return null;
  return { apiKey: match[1]!, apiSecret: match[2]!, cloudName: match[3]! };
}

let current: PhotosResponse = {
  configured: config.cloudinary.url !== null,
  photos: [],
  fetchedAt: null,
};
let timer: NodeJS.Timeout | null = null;

function creds(): CloudinaryCreds | null {
  return config.cloudinary.url ? parseCloudinaryUrl(config.cloudinary.url) : null;
}

async function adminApi(path: string): Promise<unknown> {
  const c = creds();
  if (!c) throw new Error('Cloudinary is not configured');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}${path}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.apiKey}:${c.apiSecret}`).toString('base64')}`,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Cloudinary responded ${res.status}`);
  return res.json();
}

export async function refreshPhotos(): Promise<void> {
  const c = creds();
  if (!c) {
    current = { ...current, configured: false };
    return;
  }
  try {
    const folder = getSettings().photoFolder;
    const prefixParam = folder ? `&prefix=${encodeURIComponent(folder + '/')}` : '';
    const data = (await adminApi(
      `/resources/image?type=upload&max_results=${MAX_PHOTOS}${prefixParam}`,
    )) as { resources: { public_id: string; format: string }[] };

    current = {
      configured: true,
      photos: data.resources.map((r) => ({
        id: r.public_id,
        // Panel-sized, auto-format/quality — Cloudinary does the work.
        url: `https://res.cloudinary.com/${c.cloudName}/image/upload/f_auto,q_auto,w_1920,h_1080,c_fill/${r.public_id}`,
      })),
      fetchedAt: new Date().toISOString(),
    };
    getDb()
      .prepare(
        `INSERT INTO kv_cache (key, payload, fetched_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
      )
      .run(CACHE_KEY, JSON.stringify(current), current.fetchedAt);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Generic message to clients; raw upstream/provider detail to the log.
    current = { ...current, error: 'Could not load photos' };
    logger.warn({ err: message }, 'photo refresh failed');
  }
}

export async function listFolders(): Promise<string[]> {
  const data = (await adminApi('/folders')) as { folders: { path: string }[] };
  return data.folders.map((f) => f.path);
}

export function getPhotos(): PhotosResponse {
  return current;
}

export function warmPhotosFromDb(): void {
  const row = getDb()
    .prepare('SELECT payload FROM kv_cache WHERE key = ?')
    .get(CACHE_KEY) as { payload: string } | undefined;
  if (row) {
    try {
      current = {
        ...(JSON.parse(row.payload) as PhotosResponse),
        configured: config.cloudinary.url !== null,
      };
    } catch {
      // Corrupt cache — next refresh replaces it.
    }
  }
}

export function startPhotosRefresh(): void {
  if (timer) return;
  warmPhotosFromDb();
  void refreshPhotos();
  timer = setInterval(() => void refreshPhotos(), REFRESH_INTERVAL_MS);
  timer.unref();
}

export function stopPhotosRefresh(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
