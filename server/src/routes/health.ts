import { Router } from 'express';
import type { Health } from '@canopy/shared';
import { config } from '../config.js';

const startedAt = Date.now();

/**
 * Integration status registry. Each integration self-reports here as it
 * is built (Google, weather, Cloudinary…). `ok: null` = not yet probed.
 */
type IntegrationStatus = { configured: boolean; ok: boolean | null; detail?: string };
const integrations = new Map<string, IntegrationStatus>();

export function reportIntegration(name: string, status: IntegrationStatus): void {
  integrations.set(name, status);
}

reportIntegration('googleCalendar', {
  configured: config.google.serviceAccountPath !== null,
  ok: null,
});
reportIntegration('weather', { configured: config.weather.apiKey !== null, ok: null });
reportIntegration('cloudinary', { configured: config.cloudinary.url !== null, ok: null });
reportIntegration('gmail', {
  configured: config.google.oauthRefreshToken !== null,
  ok: null,
});

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const body: Health = {
    ok: true,
    version: process.env.npm_package_version ?? '0.1.0',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    integrations: Object.fromEntries(integrations),
  };
  res.json(body);
});
