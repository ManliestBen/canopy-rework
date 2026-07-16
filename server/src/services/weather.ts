import { toDateKey, type Weather, type WeatherDay } from '@canopy/shared';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { logger } from '../logger.js';
import { getSettings } from './settings.js';

/**
 * OpenWeatherMap via the free-tier endpoints (geocoding, current
 * weather, 5-day/3-hour forecast). Alerts come from One Call 3.0 when
 * the key has access; otherwise they degrade silently to none.
 * Same pattern as calendars: background refresh + last-good cache.
 */
const REFRESH_INTERVAL_MS = 15 * 60_000;
const TIMEOUT_MS = 10_000;
const CACHE_KEY = 'weather';

/** OWM icon code → emoji (self-contained; works offline & in all themes). */
const EMOJI: Record<string, string> = {
  '01d': '☀️', '01n': '🌙',
  '02d': '⛅', '02n': '☁️',
  '03d': '☁️', '03n': '☁️',
  '04d': '☁️', '04n': '☁️',
  '09d': '🌧️', '09n': '🌧️',
  '10d': '🌦️', '10n': '🌧️',
  '11d': '⛈️', '11n': '⛈️',
  '13d': '❄️', '13n': '❄️',
  '50d': '🌫️', '50n': '🌫️',
};

type ForecastEntry = {
  dt: number;
  main: { temp_min: number; temp_max: number };
  weather: { icon: string; description: string }[];
  pop?: number;
};

/** Collapse 3-hourly entries into daily min/max + midday icon. */
export function aggregateForecast(entries: ForecastEntry[]): WeatherDay[] {
  const byDay = new Map<
    string,
    { min: number; max: number; pop: number; icons: Map<number, string>; descs: Map<number, string> }
  >();
  for (const entry of entries) {
    const when = new Date(entry.dt * 1000);
    const key = toDateKey(when);
    const day = byDay.get(key) ?? {
      min: Infinity,
      max: -Infinity,
      pop: 0,
      icons: new Map(),
      descs: new Map(),
    };
    day.min = Math.min(day.min, entry.main.temp_min);
    day.max = Math.max(day.max, entry.main.temp_max);
    day.pop = Math.max(day.pop, entry.pop ?? 0);
    const hour = when.getHours();
    const first = entry.weather[0];
    if (first) {
      day.icons.set(hour, first.icon);
      day.descs.set(hour, first.description);
    }
    byDay.set(key, day);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, d]) => {
      // Prefer the entry closest to midday as the day's face.
      const hours = [...d.icons.keys()].sort(
        (a, b) => Math.abs(a - 13) - Math.abs(b - 13),
      );
      const icon = hours.length > 0 ? d.icons.get(hours[0]!)! : '01d';
      return {
        dateKey,
        min: Math.round(d.min),
        max: Math.round(d.max),
        emoji: EMOJI[icon] ?? '🌡️',
        description: hours.length > 0 ? (d.descs.get(hours[0]!) ?? '') : '',
        pop: Math.round(d.pop * 100) / 100,
      };
    });
}

let current: Weather = {
  configured: config.weather.apiKey !== null,
  location: null,
  current: null,
  daily: [],
  alerts: [],
  fetchedAt: null,
};
let timer: NodeJS.Timeout | null = null;
let geocodeCache: { query: string; name: string; lat: number; lon: number } | null = null;

async function owmFetch(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`OpenWeatherMap responded ${res.status}`);
  return res.json();
}

export async function refreshWeather(): Promise<void> {
  const apiKey = config.weather.apiKey;
  const query = getSettings().locationQuery;
  if (!apiKey || !query) {
    current = { ...current, configured: apiKey !== null };
    return;
  }
  try {
    if (!geocodeCache || geocodeCache.query !== query) {
      const geo = (await owmFetch(
        `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=1&appid=${apiKey}`,
      )) as { name: string; lat: number; lon: number; state?: string }[];
      const hit = geo[0];
      if (!hit) throw new Error(`Location "${query}" not found`);
      geocodeCache = { query, name: hit.name, lat: hit.lat, lon: hit.lon };
    }
    const { lat, lon, name } = geocodeCache;

    const [nowRaw, forecastRaw] = await Promise.all([
      owmFetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${apiKey}`,
      ),
      owmFetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=imperial&appid=${apiKey}`,
      ),
    ]);
    const now = nowRaw as {
      main: { temp: number; feels_like: number; humidity: number };
      weather: { icon: string; description: string }[];
      wind: { speed: number };
    };
    const forecast = forecastRaw as { list: ForecastEntry[] };

    // Alerts need One Call 3.0 — degrade silently if the key lacks it.
    let alerts: Weather['alerts'] = [];
    try {
      const oneCall = (await owmFetch(
        `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily,current&appid=${apiKey}`,
      )) as { alerts?: { event: string; description: string; start: number; end: number }[] };
      alerts = (oneCall.alerts ?? []).map((a) => ({
        event: a.event,
        description: a.description.slice(0, 500),
        start: new Date(a.start * 1000).toISOString(),
        end: new Date(a.end * 1000).toISOString(),
      }));
    } catch {
      // Key without One Call access — no alerts, everything else works.
    }

    const icon = now.weather[0]?.icon ?? '01d';
    current = {
      configured: true,
      location: { name, lat, lon },
      current: {
        temp: Math.round(now.main.temp),
        feelsLike: Math.round(now.main.feels_like),
        description: now.weather[0]?.description ?? '',
        emoji: EMOJI[icon] ?? '🌡️',
        humidity: now.main.humidity,
        windMph: Math.round(now.wind.speed),
      },
      daily: aggregateForecast(forecast.list),
      alerts,
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
    current = { ...current, error: 'Could not load weather' };
    logger.warn({ err: message }, 'weather refresh failed');
  }
}

export function getWeather(): Weather {
  return current;
}

export function warmWeatherFromDb(): void {
  const row = getDb()
    .prepare('SELECT payload FROM kv_cache WHERE key = ?')
    .get(CACHE_KEY) as { payload: string } | undefined;
  if (row) {
    try {
      current = { ...(JSON.parse(row.payload) as Weather), configured: config.weather.apiKey !== null };
    } catch {
      // Corrupt cache — next refresh replaces it.
    }
  }
}

export function startWeatherRefresh(): void {
  if (timer) return;
  warmWeatherFromDb();
  void refreshWeather();
  timer = setInterval(() => void refreshWeather(), REFRESH_INTERVAL_MS);
  timer.unref();
}

export function stopWeatherRefresh(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
