import type { z } from 'zod';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * All client↔server traffic flows through here. Responses are validated
 * against the shared zod schema, so types are real — no `as` casts and
 * server drift fails loudly in dev instead of corrupting UI state.
 */
async function apiFetch<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      if (body.error) message = body.error;
      code = body.code;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiRequestError(message, res.status, code);
  }
  return schema.parse(await res.json());
}

export function apiGet<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  path: string,
): Promise<T> {
  return apiFetch(schema, path);
}

export function apiSend<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  return apiFetch(schema, path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
