import {
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';
import type { ConnectTelegramAdapterConfig } from './types.js';

/**
 * Token parameters accepted by {@link connectTelegramAdapter}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus
 * `subject` — Telegram bot tokens are app-scoped, so this helper pins the
 * subject to `{ type: "app" }`.
 */
export type ConnectTelegramAdapterParams = Omit<ConnectTokenParams, 'subject'>;

/**
 * Build a Telegram adapter config fragment backed by a Vercel Connect
 * connector.
 *
 * The helper resolves outbound Telegram Bot API tokens only. Telegram webhooks
 * are delivered directly and must continue to use the adapter's native
 * `secretToken` / `TELEGRAM_WEBHOOK_SECRET_TOKEN` verification, or polling.
 *
 * ```ts
 * import { createTelegramAdapter } from "@chat-adapter/telegram";
 * import { connectTelegramAdapter } from "@vercel/connect/chat";
 *
 * createTelegramAdapter({
 *   ...connectTelegramAdapter("telegram/acme-telegram"),
 *   secretToken: process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN,
 * });
 * ```
 */
export function connectTelegramAdapter(
  connector: string,
  params: ConnectTelegramAdapterParams = {},
  options?: ConnectOptions
): ConnectTelegramAdapterConfig {
  return {
    botToken: () =>
      getToken(connector, { ...params, subject: { type: 'app' } }, options),
  };
}
