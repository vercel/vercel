/**
 * Shared facts about the Vercel AI Gateway used when configuring coding agents.
 *
 * The gateway exposes the same models behind three wire-compatible shapes:
 * - OpenAI Chat Completions / Responses at `${OPENAI_BASE_URL}` (note the `/v1`).
 * - Anthropic Messages at `${ANTHROPIC_BASE_URL}` (no `/v1`; the Anthropic SDK
 *   appends `/v1/messages` itself).
 * All shapes authenticate with the same key via `Authorization: Bearer <key>`.
 */
export const GATEWAY_OPENAI_BASE_URL = 'https://ai-gateway.vercel.sh/v1';
export const GATEWAY_ANTHROPIC_BASE_URL = 'https://ai-gateway.vercel.sh';

/** Canonical env var the gateway, AI SDK, and supported agents read the key from. */
export const GATEWAY_API_KEY_ENV = 'AI_GATEWAY_API_KEY';

/**
 * Placeholder stood in for the real key while previewing diffs, so we never mint
 * an API key until the user confirms (avoids orphaned keys on decline / dry-run).
 */
export const KEY_PLACEHOLDER = '__AI_GATEWAY_API_KEY__';

/**
 * Masks a secret for display in diffs and receipts: keeps a short prefix and the
 * last 4 chars so it stays identifiable without leaking the value to scrollback.
 */
export function maskSecret(secret: string): string {
  if (!secret) return secret;
  if (secret === KEY_PLACEHOLDER) return '••••';
  if (secret.length <= 8) return '••••';
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}
