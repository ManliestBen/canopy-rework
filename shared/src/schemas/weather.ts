import { z } from 'zod';
import { DATE_KEY_REGEX } from '../dates';

export const WeatherCurrentSchema = z.object({
  temp: z.number(),
  feelsLike: z.number(),
  description: z.string(),
  emoji: z.string(),
  humidity: z.number(),
  windMph: z.number(),
});

export const WeatherDaySchema = z.object({
  dateKey: z.string().regex(DATE_KEY_REGEX),
  min: z.number(),
  max: z.number(),
  emoji: z.string(),
  description: z.string(),
  /** Probability of precipitation 0–1. */
  pop: z.number(),
});
export type WeatherDay = z.infer<typeof WeatherDaySchema>;

export const WeatherAlertSchema = z.object({
  event: z.string(),
  description: z.string(),
  start: z.string(),
  end: z.string(),
});

export const WeatherSchema = z.object({
  configured: z.boolean(),
  location: z
    .object({ name: z.string(), lat: z.number(), lon: z.number() })
    .nullable(),
  current: WeatherCurrentSchema.nullable(),
  daily: z.array(WeatherDaySchema),
  alerts: z.array(WeatherAlertSchema),
  fetchedAt: z.string().nullable(),
  error: z.string().optional(),
});
export type Weather = z.infer<typeof WeatherSchema>;
