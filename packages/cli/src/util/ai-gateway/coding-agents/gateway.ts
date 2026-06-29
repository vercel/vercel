export const GATEWAY_OPENAI_BASE_URL = 'https://ai-gateway.vercel.sh/v1';
export const GATEWAY_ANTHROPIC_BASE_URL = 'https://ai-gateway.vercel.sh';

export const GATEWAY_API_KEY_ENV = 'AI_GATEWAY_API_KEY';

export const KEY_PLACEHOLDER = '__AI_GATEWAY_API_KEY__';

export function maskSecret(secret: string): string {
  if (!secret) return secret;
  if (secret === KEY_PLACEHOLDER) return '••••';
  if (secret.length <= 8) return '••••';
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}
