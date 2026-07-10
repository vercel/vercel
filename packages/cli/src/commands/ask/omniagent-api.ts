import { createHash } from 'node:crypto';
import type Client from '../../util/client';
import fetch, { Headers, type Response } from '../../util/fetch';
import output from '../../output-manager';
import ua from '../../util/ua';

/**
 * The deployment of the Omniagent HTTP API that `vercel ask` talks to.
 *
 * This currently targets the preview build of the Omniagent sessions API
 * (vercel/agents#2125) until the API ships to production.
 */
const DEFAULT_OMNIAGENT_URL =
  'https://omniagent-git-adriancooney-omniagent-api-pr4-async-polling.vercel.sh';

/**
 * The vercel.com endpoint that exchanges a Vercel session for a deployment
 * protection JWT (`_vercel_jwt`).
 */
const SSO_API_URL = 'https://vercel.com/sso-api';

export function getOmniagentBaseUrl(): string {
  return process.env.VERCEL_OMNIAGENT_URL || DEFAULT_OMNIAGENT_URL;
}

function getSsoApiUrl(): string {
  return process.env.VERCEL_SSO_API_URL || SSO_API_URL;
}

export class OmniagentApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'OmniagentApiError';
    this.status = status;
  }
}

export interface SessionUIMessagePart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface SessionUIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: SessionUIMessagePart[];
}

export interface SessionSnapshot {
  id: string;
  lastTurn: {
    assistantMessageId: string;
    state: string;
  } | null;
  messages: SessionUIMessage[];
  streamingMessageId: string | null;
  title: string | null;
}

interface RequestOptions {
  method: 'GET' | 'POST';
  body?: unknown;
}

/**
 * Minimal HTTP client for the Omniagent sessions API. Authenticates with the
 * CLI bearer token and transparently completes the Vercel deployment
 * protection SSO handshake when the target deployment is protected.
 */
export class OmniagentApi {
  private client: Client;
  private baseUrl: string;
  private protectionCookie: string | undefined;

  constructor(client: Client) {
    this.client = client;
    this.baseUrl = getOmniagentBaseUrl();
  }

  async createSession(teamId: string): Promise<{ sessionId: string }> {
    const response = await this.request('/api/sessions', {
      method: 'POST',
      body: { teamId, surface: 'dashboard' },
    });
    const data = (await response.json()) as { sessionId: string };
    return { sessionId: data.sessionId };
  }

  async getSession(sessionId: string): Promise<SessionSnapshot> {
    const response = await this.request(
      `/api/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'GET' }
    );
    return (await response.json()) as SessionSnapshot;
  }

  /**
   * Starts a turn and returns the raw UI message SSE response so the caller
   * can consume (or abandon) the stream.
   */
  async startTurn(
    sessionId: string,
    opts: { prompt: string; teamId?: string }
  ): Promise<Response> {
    return this.request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      body: {
        type: 'message',
        message: opts.prompt,
        ...(opts.teamId ? { teamId: opts.teamId } : {}),
      },
    });
  }

  private async request(path: string, opts: RequestOptions): Promise<Response> {
    const url = new URL(path, this.baseUrl).href;

    let response = await this.fetchOnce(url, opts);

    if (isProtectionChallenge(response)) {
      await this.resolveProtectionCookie(response, url);
      response = await this.fetchOnce(url, opts);
    }

    if (!response.ok) {
      throw await createApiError(response);
    }

    return response;
  }

  private async fetchOnce(
    url: string,
    opts: RequestOptions
  ): Promise<Response> {
    const token = this.client.authConfig.token;
    const headers = new Headers();
    headers.set('user-agent', ua);
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    if (this.protectionCookie) {
      headers.set('cookie', this.protectionCookie);
    }
    if (opts.body !== undefined) {
      headers.set('content-type', 'application/json');
    }

    return fetch(url, {
      method: opts.method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      redirect: 'manual',
    });
  }

  /**
   * Completes the same SSO handshake the browser uses to access deployments
   * protected by Vercel Authentication, using the current CLI token. Populates
   * `this.protectionCookie` on success.
   */
  private async resolveProtectionCookie(
    redirectResponse: Response,
    requestUrl: string
  ): Promise<void> {
    const nonce = getSetCookieValue(redirectResponse, '_vercel_sso_nonce');
    const token = this.client.authConfig.token;
    if (!nonce || !token) {
      throw new OmniagentApiError(
        'The Vercel Agent API deployment requires authentication. Run `vercel login` and try again.',
        401
      );
    }

    const hashedNonce = createHash('sha256').update(nonce).digest('hex');
    const ssoUrl = `${getSsoApiUrl()}?url=${encodeURIComponent(
      requestUrl
    )}&nonce=${hashedNonce}`;
    const sso = await fetch(ssoUrl, {
      redirect: 'manual',
      headers: {
        cookie: `authorization=${encodeURIComponent(`Bearer ${token}`)}; isLoggedIn=1`,
        'user-agent': ua,
      },
    });

    const location = sso.headers.get('location');
    const jwt = location ? getUrlParam(location, '_vercel_jwt') : null;
    if (!jwt) {
      output.debug(
        `Vercel Agent SSO handshake failed with status ${sso.status}`
      );
      throw new OmniagentApiError(
        'You do not have access to the Vercel Agent API deployment.',
        403
      );
    }

    this.protectionCookie = `_vercel_sso_nonce=${nonce}; _vercel_jwt=${jwt}`;
  }
}

/**
 * Detects the Vercel deployment protection challenge. Protection answers
 * browser-style GET requests with a 302 redirect to the SSO endpoint, but
 * requests carrying an `Authorization` header (like ours) receive a 401.
 * Both variants set the `_vercel_sso_nonce` cookie used by the handshake.
 */
function isProtectionChallenge(response: Response): boolean {
  const isChallengeStatus =
    response.status === 401 ||
    (response.status >= 300 && response.status < 400);
  return (
    isChallengeStatus &&
    getSetCookieValue(response, '_vercel_sso_nonce') !== null
  );
}

function getSetCookieValue(response: Response, name: string): string | null {
  const header = response.headers.get('set-cookie');
  if (!header) {
    return null;
  }
  const match = header.match(new RegExp(`${name}=([^;,\\s]+)`));
  return match ? match[1] : null;
}

function getUrlParam(url: string, name: string): string | null {
  try {
    return new URL(url).searchParams.get(name);
  } catch {
    return null;
  }
}

async function createApiError(response: Response): Promise<OmniagentApiError> {
  let message = `Vercel Agent request failed with status ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof body.error === 'string'
    ) {
      message = body.error;
    }
  } catch {
    // Non-JSON error body; keep the generic message.
  }
  return new OmniagentApiError(message, response.status);
}
