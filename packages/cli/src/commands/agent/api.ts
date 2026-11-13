import type { ReadableStream } from 'node:stream/web';
import type Client from '../../util/client';
import type { JSONObject } from '@vercel-internals/types';
import type {
  SessionDetails,
  SessionList,
  SessionMessageRequest,
} from './types';
import process from 'node:process';
import { AgentError, toAgentError } from './errors';

/** The vercel.com proxy the dashboard uses for Vercel Agent. */
const AGENT_API_BASE = 'https://vercel.com/api/omniagent';

function getAgentApiBase(): string {
  return process.env.VERCEL_AGENT_API_URL || AGENT_API_BASE;
}

export function sessionUrl(teamSlug: string, sessionId: string): string {
  return `https://vercel.com/${encodeURIComponent(teamSlug)}/~/agent/chat/${encodeURIComponent(sessionId)}`;
}

/** Vercel Agent sessions, over `client.fetch` (auth, retries and errors as in Vercel CLI). */
export interface AgentApi {
  listSessions: (teamId: string) => Promise<SessionList>;
  getSession: (teamId: string, sessionId: string) => Promise<SessionDetails>;
  /** POST a message. Creates the session if `sessionId` is new. Resolves to the SSE body. */
  sendMessage: (
    sessionId: string,
    body: SessionMessageRequest,
    signal?: AbortSignal
  ) => Promise<ReadableStream<Uint8Array>>;
  /** Re-attach to a running turn. Resolves to `null` while the stream is not registered yet (204). */
  reconnect: (
    teamId: string,
    sessionId: string,
    signal?: AbortSignal
  ) => Promise<ReadableStream<Uint8Array> | null>;
  interrupt: (teamId: string, sessionId: string) => Promise<void>;
}

export function createAgentApi(client: Client): AgentApi {
  /** The proxy rejects any query key besides `teamId`, so the client must not add its own. */
  const url = (teamId: string, path: string): string =>
    `${getAgentApiBase()}/${path}?teamId=${encodeURIComponent(teamId)}`;
  const session = (teamId: string, id: string, suffix = ''): string =>
    url(teamId, `sessions/${encodeURIComponent(id)}${suffix}`);

  async function request<T>(
    target: string,
    init: Parameters<Client['fetch']>[1] = {}
  ): Promise<T> {
    try {
      return await client.fetch<T>(target, { useCurrentTeam: false, ...init });
    } catch (error) {
      throw toAgentError(error);
    }
  }

  async function stream(
    target: string,
    init: Parameters<Client['fetch']>[1] = {}
  ): Promise<Response> {
    try {
      return await client.fetch(target, {
        useCurrentTeam: false,
        ...init,
        json: false,
      });
    } catch (error) {
      throw toAgentError(error);
    }
  }

  function body(response: Response): ReadableStream<Uint8Array> {
    if (!response.body)
      throw new AgentError(
        'api_error',
        'The agent returned an empty response.'
      );
    return response.body as unknown as ReadableStream<Uint8Array>;
  }

  return {
    listSessions: teamId => request(url(teamId, 'sessions')),
    getSession: (teamId, sessionId) => request(session(teamId, sessionId)),
    async sendMessage(sessionId, message, signal) {
      return body(
        await stream(session(message.teamId, sessionId), {
          method: 'POST',
          body: { ...message } as unknown as JSONObject,
          signal,
          // A retry would post the message twice.
          retry: { retries: 0 },
        })
      );
    },
    async reconnect(teamId, sessionId, signal) {
      const response = await stream(session(teamId, sessionId, '/stream'), {
        signal,
      });
      return response.status === 204 ? null : body(response);
    },
    async interrupt(teamId, sessionId) {
      await stream(session(teamId, sessionId, '/interrupt'), {
        method: 'POST',
        retry: { retries: 0 },
      });
    },
  };
}
