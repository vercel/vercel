export interface SlackChannelCredentials {
  readonly botToken: () => string | Promise<string>;
  readonly webhookVerifier?: unknown;
}
