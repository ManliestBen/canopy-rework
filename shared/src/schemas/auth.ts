import { z } from 'zod';

export const PIN_REGEX = /^\d{4,8}$/;

export const AuthStatusSchema = z.object({
  /** True when the request comes from the panel itself (loopback). */
  isPanel: z.boolean(),
  /** True when a valid session cookie is present. */
  authenticated: z.boolean(),
  /** True when a family PIN has been configured. */
  hasPin: z.boolean(),
});
export type AuthStatus = z.infer<typeof AuthStatusSchema>;

export const PinLoginSchema = z.object({
  pin: z.string().regex(PIN_REGEX, 'PIN must be 4–8 digits'),
});

export const PinSetSchema = z.object({
  /** Required once a PIN exists (unless called from the panel). */
  currentPin: z.string().regex(PIN_REGEX).optional(),
  newPin: z.string().regex(PIN_REGEX, 'PIN must be 4–8 digits'),
});

export const OkSchema = z.object({ ok: z.literal(true) });
