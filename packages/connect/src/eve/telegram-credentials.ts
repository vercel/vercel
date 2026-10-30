import {
  createConnectWebhookVerifier,
  type ConnectWebhookVerifier,
} from '../chat/webhook-verifier.js';
import {
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';

/** Telegram channel credentials returned by {@link connectTelegramCredentials}. */
export interface ConnectTelegramCredentials {
  /** Bot API token for outbound Telegram calls. */
  botToken: () => Promise<string>;
  /** Verifies webhooks forwarded by Vercel Connect. */
  webhookVerifier: ConnectWebhookVerifier;
}

/**
 * Token parameters accepted by {@link connectTelegramCredentials}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus `subject`.
 * Telegram bot tokens are app-scoped, so this helper always uses
 * `{ type: 'app' }`.
 */
export type ConnectTelegramCredentialsParams = Omit<
  ConnectTokenParams,
  'subject'
>;

/**
 * Build Telegram channel credentials backed by a Vercel Connect connector.
 *
 * Connect registers the bot's webhook, checks Telegram's secret-token header,
 * and forwards each update with a Vercel OIDC token. `webhookVerifier`
 * validates that token, so the eve deployment needs neither
 * `TELEGRAM_BOT_TOKEN` nor `TELEGRAM_WEBHOOK_SECRET_TOKEN`.
 *
 * ```ts
 * import { connectTelegramCredentials } from '@vercel/connect/eve';
 * import { telegramChannel } from 'eve/channels/telegram';
 *
 * export default telegramChannel({
 *   botUsername: 'my_bot',
 *   credentials: connectTelegramCredentials('telegram/my-agent'),
 * });
 * ```
 */
export function connectTelegramCredentials(
  connector: string,
  params: ConnectTelegramCredentialsParams = {},
  options?: ConnectOptions
): ConnectTelegramCredentials {
  return {
    botToken: () =>
      getToken(connector, { ...params, subject: { type: 'app' } }, options),
    webhookVerifier: createConnectWebhookVerifier(),
  };
}
