import {
  channelCredentialsMetadata,
  type ConnectChannelMetadata,
} from '../internal/channel-credentials-metadata.js';
import {
  createConnectWebhookVerifier,
  type ConnectWebhookVerifier,
} from '../chat/webhook-verifier.js';
import {
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';

/** Telegram credentials for eve, backed by a Connect API-key connector. */
export interface ConnectTelegramCredentials {
  botToken: () => Promise<string>;
  webhookVerifier: ConnectWebhookVerifier;
}

export type ConnectTelegramCredentialsParams = Omit<
  ConnectTokenParams,
  'subject'
>;

/**
 * Use an app-scoped Telegram API-key connector with eve.
 * The bot token is resolved only when eve makes a Telegram API call.
 * Register Telegram webhooks through Connect before using this helper.
 * Direct Telegram delivery needs native secret-token verification instead.
 */
export function connectTelegramCredentials(
  connector: string,
  params: ConnectTelegramCredentialsParams = {},
  options?: ConnectOptions
): ConnectTelegramCredentials & ConnectChannelMetadata {
  return {
    ...channelCredentialsMetadata(connector, 'telegram', 'api-key'),
    botToken: () =>
      getToken(connector, { ...params, subject: { type: 'app' } }, options),
    webhookVerifier: createConnectWebhookVerifier(),
  };
}
