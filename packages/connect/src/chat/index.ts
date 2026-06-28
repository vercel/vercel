/**
 * Public surface of the `@vercel/connect/chat` subpath.
 *
 * Holds helpers that adapt the Vercel Connect SDK to the Chat SDK
 * (`chat`) platform adapters. Each helper returns a config fragment you
 * spread into the matching `create*Adapter` factory, wiring a Connect
 * connector for both outbound tokens (`getToken`) and inbound
 * trigger-forwarded webhooks (Vercel OIDC verification).
 *
 * The helpers stay decoupled from `@chat-adapter/*`: they return
 * structural config types rather than importing the adapter packages,
 * so this subpath has no Chat SDK dependency.
 *
 * ```ts
 * import { createSlackAdapter } from "@chat-adapter/slack";
 * import { connectSlackAdapter } from "@vercel/connect/chat";
 *
 * createSlackAdapter({
 *   ...connectSlackAdapter("slack/acme-slack"),
 * });
 * ```
 */
export {
  createConnectWebhookVerifier,
  type ConnectWebhookVerifier,
  type ConnectWebhookVerifierOptions,
} from './webhook-verifier.js';

export type {
  ConnectGitHubAdapterConfig,
  ConnectLinearAdapterConfig,
  ConnectTokenResolver,
} from './types.js';

export {
  connectSlackAdapter,
  type ConnectSlackAdapterConfig,
  type ConnectSlackAdapterParams,
} from './slack-adapter.js';
export {
  connectGitHubAdapter,
  type ConnectGitHubAdapterParams,
} from './github-adapter.js';
export {
  connectLinearAdapter,
  type ConnectLinearAdapterParams,
} from './linear-adapter.js';
