import http from 'node:http';
import { listen } from 'async-listen';
import open from 'open';
import * as z from 'zod/mini';
import type { OAuth } from './oauth';
import type { Credentials } from './credentials-store';

/**
 * Re-authorize a team's SSO session by opening the browser and waiting for the user to complete
 * the SSO flow. Use when the user's SSO session has expired or missing.
 *
 */
export async function reauthorizeTeam(params: {
  /** The team's slug that requires re-authorization */
  team: string;
  /** The current access token that needs to be re-authorized */
  token: Credentials['token'];
  oauth: OAuth;
}): Promise<void> {
  const { team, token, oauth } = params;

  if (!token) {
    throw new TypeError(
      'Token is missing, cannot initiate SSO re-authorization. Please log in again.'
    );
  }

  const introspection = await oauth.introspectToken(token);
  const { active, session_id, client_id } = introspection;

  if (!active || !session_id || !client_id) {
    throw new Error(
      'Introspection failed. Token is either expired or otherwise invalid. Please log in again.'
    );
  }

  const verificationToken = await waitForVerification({
    team,
    session_id,
    client_id,
  });

  await fetch(
    `https://api.vercel.com/registration/verify?${new URLSearchParams({ token: verificationToken })}`
  );
}

/**
 * Get a verification token by spawning a localhost HTTP server
 * that gets redirected to as the OAuth callback URL.
 *
 * The token returned can be sent back to the Vercel API to complete
 * the SSO re-authorization.
 */
async function waitForVerification(params: {
  team: string;
  session_id: string;
  client_id: string;
}): Promise<string> {
  const { team, session_id, client_id } = params;
  const server = http.createServer();
  const { port } = await listen(server, 0, '127.0.0.1');
  const initSSOUrl = new URL(
    `/sso/${team}?${new URLSearchParams({
      session_id,
      client_id,
      next: `http://localhost:${port}`,
    })}`,
    `https://vercel.com`
  );

  try {
    const [query] = await Promise.all([
      new Promise<URLSearchParams>((resolve, reject) => {
        server.once('request', (req, res) => {
          // Close the HTTP connection to prevent `server.close()` from hanging
          res.setHeader('connection', 'close');

          const { searchParams } = new URL(req.url || '/', 'http://localhost');
          resolve(searchParams);

          // Redirect the user back to the Vercel login notification page
          res.statusCode = 302;
          res.setHeader('location', getNotificationUrl(searchParams)).end();
        });
        server.once('error', reject);
      }),
      open(initSSOUrl.href),
    ]);

    const loginError = query.get('loginError');
    if (loginError) {
      const error = new Error('Login failed.');
      error.cause = JSON.parse(loginError);
      throw error;
    }

    const token = query.get('token');
    if (!token) {
      throw new TypeError(
        'Could not get verification token. Please contact support.'
      );
    }

    return token;
  } finally {
    server.close();
  }
}

function getNotificationUrl(params: URLSearchParams): string {
  const loginState = params.has('loginError')
    ? 'failed'
    : params.has('ssoEmail')
      ? 'incomplete'
      : 'success';

  return `https://vercel.com/notifications/cli-login-${loginState}?${params}`;
}

const SSOError = z.object({
  code: z.string(),
  message: z.string(),
  scope: z.optional(z.string()),
  enforced: z.optional(z.boolean()),
});

/** Parse an error-like object to determine if SSO re-authorization is required. */
export function parseSSOError(
  error: unknown
): z.infer<typeof SSOError> | undefined {
  const { data } = SSOError.safeParse(error);
  if (!data?.enforced) return;
  return data;
}
