import { createWebhook, type Webhook, type WebhookOptions } from 'workflow';
import type { ConnectAuthorizationOptions } from '../authorization.js';

export interface ConnectWorkflowAuthorization extends Disposable {
  /** Await this after presenting the authorization URL to the user. */
  readonly completion: Webhook<Request>;
  /** Options to pass to `startAuthorization()` from a Workflow step. */
  readonly startOptions: Pick<
    ConnectAuthorizationOptions,
    'callbackUrl' | 'webhook'
  >;
}

/**
 * Creates the durable completion signal for an interactive Connect authorization.
 *
 * Pass `startOptions` to `startAuthorization()` from a Workflow step, then await
 * `completion` in the Workflow. HTTPS deployments use Connect's server-side
 * webhook; local HTTP development uses the browser callback.
 */
export function createConnectAuthorization(
  options?: WebhookOptions
): ConnectWorkflowAuthorization {
  const completion = createWebhook(options);
  const startOptions =
    new URL(completion.url).protocol === 'https:'
      ? { webhook: completion.url }
      : { callbackUrl: completion.url };

  return {
    completion,
    startOptions,
    [Symbol.dispose]() {
      completion[Symbol.dispose]();
    },
  };
}
