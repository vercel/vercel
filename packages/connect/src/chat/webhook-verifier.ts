import { verifyVercelOidcToken } from '@vercel/oidc';

const BEARER_TOKEN_PATTERN = /^Bearer\s+(.+)$/i;

/**
 * Webhook verifier signature used by Chat SDK adapters. Returning a
 * truthy value marks the request as verified; throwing (or returning a
 * falsy value) makes the adapter respond `401`.
 *
 * Mirrors the `webhookVerifier` option accepted by the Slack, GitHub,
 * and Linear adapters from the `chat` package, so the helpers in this
 * subpath stay decoupled from `@chat-adapter/*` while remaining
 * structurally compatible.
 */
export type ConnectWebhookVerifier = (
  request: Request,
  body: string
) => Promise<unknown> | unknown;

/**
 * Options forwarded to {@link verifyVercelOidcToken}. Defaults to
 * matching `project_id` / `environment` against the current Vercel
 * deployment's `VERCEL_PROJECT_ID` and `VERCEL_TARGET_ENV` / `VERCEL_ENV`.
 */
export type ConnectWebhookVerifierOptions = Parameters<
  typeof verifyVercelOidcToken
>[1];

/**
 * Build a webhook verifier for Vercel Connect trigger-forwarded
 * webhooks.
 *
 * When Vercel Connect forwards a verified provider webhook to your
 * project, it attaches a Vercel OIDC token as a `Bearer` credential in
 * the `Authorization` header. This verifier extracts that token and
 * validates it against Vercel's JWKS via
 * {@link verifyVercelOidcToken}, replacing the provider's native
 * signature check (Slack signing secret, GitHub webhook secret, Linear
 * webhook secret).
 *
 * Trust boundary: by default the token must be issued by
 * `https://oidc.vercel.com` (issuer is hard-pinned) and match the
 * current deployment's project and environment (`projectId` defaults to
 * `VERCEL_PROJECT_ID`, `environment` to `VERCEL_TARGET_ENV` then
 * `VERCEL_ENV`). Verification fails closed — if those values are absent
 * and not supplied via `options`, every request is rejected. The
 * accepted set is therefore "any Vercel OIDC token for this
 * project + environment"; it is not pinned to a specific Connect
 * connector or to a single deployment. To tighten or broaden it (extra
 * audiences, multiple environments, an explicit project id), pass
 * `options` through to {@link verifyVercelOidcToken}.
 *
 * Pass it as the `webhookVerifier` option to a Chat SDK adapter:
 *
 * ```ts
 * createSlackAdapter({
 *   webhookVerifier: createConnectWebhookVerifier(),
 * });
 * ```
 */
export function createConnectWebhookVerifier(
  options?: ConnectWebhookVerifierOptions
): ConnectWebhookVerifier {
  return async (request: Request, _body: string): Promise<true> => {
    const token = request.headers
      .get('authorization')
      ?.match(BEARER_TOKEN_PATTERN)?.[1]
      ?.trim();
    if (!token) {
      throw new Error('Missing Authorization bearer token');
    }
    await verifyVercelOidcToken(token, options);
    return true;
  };
}
