import type { SlackChannelCredentials } from 'eve/channels/slack';

import {
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';
import { createConnectWebhookVerifier } from '../chat/webhook-verifier.js';

import type { VercelConnectMetadata } from './connection-authorization.js';

/**
 * Token parameters accepted by {@link connectSlackCredentials}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus
 * `subject` — Slack bot tokens are always app-scoped, so `subject`
 * is pinned to `{ type: "app" }` by this helper and cannot be
 * overridden.
 */
export type ConnectSlackCredentialsParams = Omit<ConnectTokenParams, 'subject'>;

/**
 * A lazy resolver function that returns {@link ConnectSlackCredentialsParams}
 * (or a Promise thereof) when called.
 *
 * Use this form with {@link connectSlackCredentials} to select an
 * `installationId` at `botToken()` invocation time — for example, by
 * reading a workspace-id from AsyncLocalStorage that was populated by an
 * inbound Slack event's `team_id` field.
 *
 * @example
 * ```ts
 * const store = new AsyncLocalStorage<{ teamId: string }>();
 *
 * const resolver: ConnectSlackCredentialsParamsResolver = () => {
 *   // `getStore()` is `undefined` outside of `store.run(...)`.
 *   const teamId = store.getStore()?.teamId;
 *   return teamId ? { installationId: teamId } : {};
 * };
 *
 * export default slackRoute({
 *   credentials: connectSlackCredentials("scl_...", resolver),
 *   async handler(event, context) {
 *     return store.run({ teamId: event.team_id }, () => yourHandler(event, context));
 *   },
 * });
 * ```
 */
export type ConnectSlackCredentialsParamsResolver = () =>
  | ConnectSlackCredentialsParams
  | Promise<ConnectSlackCredentialsParams>;

/**
 * Build {@link SlackChannelCredentials} backed by a Vercel Connect
 * connector that stores a Slack workspace's bot token.
 *
 * The returned `botToken` is a function form, invoked once per
 * inbound webhook so the chat adapter always picks up a fresh token
 * from Vercel Connect (rotation, refresh, multi-workspace tenancy
 * are all handled server-side).
 *
 * Slack bot tokens are app-scoped — one token per workspace install,
 * shared across every end-user — so this helper calls Vercel Connect
 * with `subject: { type: "app" }`. End-user identity (per-user OAuth
 * into Slack) is a separate concern handled elsewhere.
 *
 * The optional `params` and `options` arguments mirror the signature
 * of {@link getToken}, allowing callers to pass through fields like
 * `installationId`, `scopes`, or `validityBufferMs`.
 *
 * ### Static params (single workspace)
 *
 * ```ts
 * import { slackRoute } from "eve/channels/slack";
 * import { connectSlackCredentials } from "@vercel/connect/eve";
 *
 * export default slackRoute({
 *   credentials: connectSlackCredentials("scl_..."),
 * });
 * ```
 *
 * Single workspace with a pinned installation:
 *
 * ```ts
 * connectSlackCredentials("scl_...", { installationId: workspaceId });
 * ```
 *
 * ### Function params (multi-workspace)
 *
 * Pass a {@link ConnectSlackCredentialsParamsResolver} to select the
 * `installationId` dynamically at `botToken()` invocation time.  This
 * lets one Eve route serve multiple Slack workspace installations through
 * the same connector by reading request-scoped context (e.g.
 * `AsyncLocalStorage` populated from the inbound event's `team_id`).
 *
 * The resolver runs whenever Eve needs a token, which includes work that
 * happens after your `handler` has returned (for example delivering the
 * message to the session and later channel events). Those calls run outside
 * `store.run(...)`, so the resolver must handle a missing store instead of
 * assuming one, and Slack calls that need a specific workspace should be made
 * from inside the handler's scope:
 *
 * ```ts
 * import { AsyncLocalStorage } from "node:async_hooks";
 * import { slackRoute } from "eve/channels/slack";
 * import { connectSlackCredentials } from "@vercel/connect/eve";
 *
 * const store = new AsyncLocalStorage<{ teamId: string }>();
 *
 * export default slackRoute({
 *   credentials: connectSlackCredentials("scl_...", () => {
 *     // `undefined` outside of `store.run(...)`, e.g. after the handler returns.
 *     const teamId = store.getStore()?.teamId;
 *     return teamId ? { installationId: teamId } : {};
 *   }),
 *   async handler(event, context) {
 *     return store.run({ teamId: event.team_id }, () =>
 *       yourHandler(event, context)
 *     );
 *   },
 * });
 * ```
 *
 * The resolver is re-invoked on every `botToken()` call, so the
 * `installationId` is always resolved from the current async context. When it
 * returns no `installationId` (as it does outside `store.run(...)` above), the
 * request is made without one and Vercel Connect picks the connector's default
 * installation.
 */
export function connectSlackCredentials(
  connector: string,
  params?:
    | ConnectSlackCredentialsParams
    | ConnectSlackCredentialsParamsResolver,
  options?: ConnectOptions
): SlackChannelCredentials & { readonly vercelConnect: VercelConnectMetadata } {
  return {
    botToken: async () => {
      const resolvedParams =
        typeof params === 'function' ? await params() : (params ?? {});
      return getToken(
        connector,
        { ...resolvedParams, subject: { type: 'app' } },
        options
      );
    },
    webhookVerifier: createConnectWebhookVerifier(),
    vercelConnect: {
      connector,
      requirement: {
        method: 'slack',
        reference: `connector:${connector}`,
        service: 'slack',
        subjectTypes: ['app'],
      },
    },
  };
}
