import { readNonEmptyEnv } from './env.js';

const DETACHED_INTERACTIVE_AUTH_MODE = 'detached';
const INTERACTIVE_AUTH_MODE_ENV = 'VERCEL_CONNECT_INTERACTIVE_AUTH_MODE';

export function isDetachedInteractiveAuth(): boolean {
  return (
    readNonEmptyEnv(INTERACTIVE_AUTH_MODE_ENV) ===
    DETACHED_INTERACTIVE_AUTH_MODE
  );
}

export function validateCallbackUrl(
  value: string,
  label = 'callbackUrl'
): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  if (url.protocol === 'https:') return;
  if (url.protocol === 'http:' && isLocalHttpCallbackHostname(url.hostname)) {
    return;
  }
  throw new Error(
    `${label} must be https://, http://localhost, or http://*.localhost, got: ${value}`
  );
}

export function validateWebhookUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid webhook URL: ${value}`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`webhook must be https://, got: ${value}`);
  }
}

function isLocalHttpCallbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1'
  );
}
