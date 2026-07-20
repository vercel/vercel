import type Client from '../../util/client';
import type {
  CommentMessage,
  ListThreadsParams,
  MessageInput,
  MessagesListResponse,
  Thread,
  ThreadsListResponse,
} from './types';

/**
 * The Threads API requires `teamId` as an explicit query parameter on every
 * endpoint. Never route it through the client's `accountId` option, which
 * silently drops values that do not start with `team_`.
 */
function query(
  teamId: string,
  params: Record<string, string | string[] | number | undefined> = {}
): string {
  const search = new URLSearchParams({ teamId });
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        search.append(key, entry);
      }
    } else {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

const fetchOpts = { useCurrentTeam: false } as const;

export function listThreads(
  client: Client,
  teamId: string,
  params: ListThreadsParams
): Promise<ThreadsListResponse> {
  return client.fetch<ThreadsListResponse>(
    `/toolbar/threads?${query(teamId, { ...params })}`,
    fetchOpts
  );
}

export function getThread(
  client: Client,
  teamId: string,
  threadId: string
): Promise<Thread> {
  return client.fetch<Thread>(
    `/toolbar/threads/${encodeURIComponent(threadId)}?${query(teamId)}`,
    fetchOpts
  );
}

export function updateThread(
  client: Client,
  teamId: string,
  threadId: string,
  resolved: boolean
): Promise<Thread> {
  return client.fetch<Thread>(
    `/toolbar/threads/${encodeURIComponent(threadId)}?${query(teamId)}`,
    { ...fetchOpts, method: 'PATCH', body: { resolved } }
  );
}

export function listMessages(
  client: Client,
  teamId: string,
  threadId: string,
  opts: { limit?: number; cursor?: string } = {}
): Promise<MessagesListResponse> {
  return client.fetch<MessagesListResponse>(
    `/toolbar/threads/${encodeURIComponent(threadId)}/messages?${query(teamId, { ...opts })}`,
    fetchOpts
  );
}

export function addMessage(
  client: Client,
  teamId: string,
  threadId: string,
  body: MessageInput
): Promise<CommentMessage> {
  return client.fetch<CommentMessage>(
    `/toolbar/threads/${encodeURIComponent(threadId)}/messages?${query(teamId)}`,
    { ...fetchOpts, method: 'POST', body }
  );
}

export function updateMessage(
  client: Client,
  teamId: string,
  threadId: string,
  messageId: string,
  body: MessageInput
): Promise<CommentMessage> {
  return client.fetch<CommentMessage>(
    `/toolbar/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}?${query(teamId)}`,
    { ...fetchOpts, method: 'PATCH', body }
  );
}

export function deleteMessage(
  client: Client,
  teamId: string,
  threadId: string,
  messageId: string
): Promise<{ id: string }> {
  return client.fetch<{ id: string }>(
    `/toolbar/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}?${query(teamId)}`,
    { ...fetchOpts, method: 'DELETE' }
  );
}

export { isAPIError } from '../../util/errors-ts';

/** Map an unknown error to `outputError` when it's an API error; rethrow otherwise. */
export function toApiErrorParts(err: unknown): {
  code: string;
  message: string;
} {
  const apiErr = err as {
    code?: string;
    serverMessage?: string;
    status?: number;
  };
  return {
    code: apiErr.code || 'API_ERROR',
    message:
      apiErr.serverMessage || `API error (${apiErr.status ?? 'unknown'}).`,
  };
}
