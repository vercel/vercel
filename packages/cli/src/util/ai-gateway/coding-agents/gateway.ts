export const GATEWAY_OPENAI_BASE_URL = 'https://ai-gateway.vercel.sh/v1';
export const GATEWAY_ANTHROPIC_BASE_URL = 'https://ai-gateway.vercel.sh';

export const GATEWAY_CODEX_BASE_URL = 'https://ai-gateway.vercel.sh/codex/v1';

export const GATEWAY_CLAUDE_CODE_BASE_URL =
  'https://ai-gateway.vercel.sh/claude-code';

export const GATEWAY_API_KEY_ENV = 'AI_GATEWAY_API_KEY';

export const KEY_PLACEHOLDER = '__AI_GATEWAY_API_KEY__';

export function resolveGatewayBaseUrl(
  override: string | undefined,
  agentDefault: string
): string {
  const trimmed = override?.trim();
  return trimmed ? trimmed : agentDefault;
}

export function maskSecret(secret: string): string {
  if (!secret) return secret;
  if (secret === KEY_PLACEHOLDER) return '••••';
  if (secret.length <= 8) return '••••';
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}
