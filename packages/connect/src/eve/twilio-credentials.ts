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

/** Twilio credentials for eve, backed by a Connect API-key connector. */
export interface ConnectTwilioCredentials {
  accountSid: string | (() => string | Promise<string>);
  authToken: () => Promise<string>;
  webhookVerifier: ConnectWebhookVerifier;
}

export type ConnectTwilioCredentialsParams = Omit<
  ConnectTokenParams,
  'subject'
>;

/**
 * Use an app-scoped Twilio API-key connector with eve.
 * The account SID must belong to the account whose Auth Token is stored in Connect.
 * Forwarded webhooks are verified with Connect's delivery verifier.
 */
export function connectTwilioCredentials(
  connector: string,
  accountSid: ConnectTwilioCredentials['accountSid'],
  params: ConnectTwilioCredentialsParams = {},
  options?: ConnectOptions
): ConnectTwilioCredentials & ConnectChannelMetadata {
  return {
    ...channelCredentialsMetadata(connector, 'twilio', 'api-key'),
    accountSid,
    authToken: () =>
      getToken(connector, { ...params, subject: { type: 'app' } }, options),
    webhookVerifier: createConnectWebhookVerifier(),
  };
}
