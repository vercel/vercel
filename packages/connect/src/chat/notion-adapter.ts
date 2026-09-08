import {
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';
import type { ConnectNotionAdapterConfig } from './types.js';

/**
 * Token parameters accepted by {@link connectNotionAdapter}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus
 * `subject` — Notion connection tokens are app-scoped, so this helper pins
 * the subject to `{ type: "app" }`.
 */
export type ConnectNotionAdapterParams = Omit<ConnectTokenParams, 'subject'>;

/**
 * Build a Notion adapter config fragment backed by a Vercel Connect connector.
 *
 * The helper resolves outbound Notion API tokens only. Notion webhooks are
 * delivered directly and must continue to use the adapter's native
 * `verificationToken` / `NOTION_VERIFICATION_TOKEN` HMAC verification.
 *
 * ```ts
 * import { createNotionAdapter } from "@chat-adapter/notion";
 * import { connectNotionAdapter } from "@vercel/connect/chat";
 *
 * createNotionAdapter({
 *   ...connectNotionAdapter("notion/acme-notion"),
 *   verificationToken: process.env.NOTION_VERIFICATION_TOKEN,
 * });
 * ```
 */
export function connectNotionAdapter(
  connector: string,
  params: ConnectNotionAdapterParams = {},
  options?: ConnectOptions
): ConnectNotionAdapterConfig {
  return {
    token: () =>
      getToken(connector, { ...params, subject: { type: 'app' } }, options),
  };
}
