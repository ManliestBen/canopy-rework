import { google, type gmail_v1 } from 'googleapis';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Outbound email from the Canopy identity (OAuth refresh token, ported
 * concept from the original repo's proof-of-concept — now a configured
 * module instead of a script with a hardcoded recipient).
 */
let client: gmail_v1.Gmail | null = null;

export function initGmail(): void {
  const { oauthClientId, oauthClientSecret, oauthRefreshToken } = config.google;
  if (!oauthClientId || !oauthClientSecret || !oauthRefreshToken) return;
  const oauth2 = new google.auth.OAuth2(oauthClientId, oauthClientSecret);
  oauth2.setCredentials({ refresh_token: oauthRefreshToken });
  client = google.gmail({ version: 'v1', auth: oauth2, timeout: 15_000 });
  logger.info('Gmail client ready');
}

export function gmailConfigured(): boolean {
  return client !== null;
}

/** RFC 2822 message, base64url-encoded (UTF-8 safe). */
export function buildRawMessage(to: string[], subject: string, body: string): string {
  const message = [
    `To: ${to.join(', ')}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
  ].join('\r\n');
  return Buffer.from(message).toString('base64url');
}

export async function sendEmail(to: string[], subject: string, body: string): Promise<void> {
  if (!client) {
    throw Object.assign(new Error('Email is not set up on the server yet.'), {
      status: 503,
    });
  }
  await client.users.messages.send({
    userId: 'me',
    requestBody: { raw: buildRawMessage(to, subject, body) },
  });
  logger.info({ to: to.length, subject }, 'email sent');
}

/** Test hook. */
export function __setGmailForTests(c: gmail_v1.Gmail | null): void {
  client = c;
}
