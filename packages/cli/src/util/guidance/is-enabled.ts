import type Client from '../client';

export function isGuidanceEnabled(
  client: Client,
  explicit: boolean | undefined,
  defaultValue: boolean
): boolean {
  if (explicit !== undefined) return explicit;
  if (process.env.VERCEL_GUIDANCE_DISABLED) return false;
  return client.config.guidance?.enabled ?? defaultValue;
}
