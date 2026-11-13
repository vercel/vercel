import { randomUUID } from 'node:crypto';
import type { ReadableStream } from 'node:stream/web';
import type { AgentApi } from './api';
import type { PendingApproval, TurnState } from './stream';
import type { AgentMessage, StreamChunk, UserContext } from './types';
import {
  applyChunk,
  createTurnState,
  findPendingApproval,
  parseSse,
} from './stream';

export type TurnInput =
  | { text: string }
  | { approval: PendingApproval; approved: boolean };

export interface TurnOptions {
  api: AgentApi;
  teamId: string;
  sessionId: string;
  /** First message of a new session: sends `surface` so the server creates it. */
  isNew: boolean;
  input: TurnInput;
  userContext?: UserContext;
  /** Ask for a plan before changes that need elevated scopes. */
  planMode?: boolean;
  signal?: AbortSignal;
  onChunk?: (chunk: StreamChunk, state: TurnState) => void;
}

type TurnStatus = 'done' | 'approval-required' | 'error' | 'aborted';

export interface TurnResult {
  state: TurnState;
  status: TurnStatus;
  pending?: PendingApproval;
}

function buildMessage(input: TurnInput): AgentMessage {
  if ('text' in input) {
    return {
      id: randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: input.text }],
    };
  }
  const { approval, approved } = input;
  return {
    id: approval.messageId,
    role: 'assistant',
    parts: [
      {
        ...approval.part,
        state: 'approval-responded',
        approval: { id: approval.part.approval?.id ?? '', approved },
      },
    ],
  };
}

/** Reduce a UI message stream to a turn result. */
export async function consumeStream(
  body: ReadableStream<Uint8Array>,
  onChunk?: TurnOptions['onChunk'],
  seed?: AgentMessage
): Promise<TurnResult> {
  const state = createTurnState(seed);
  for await (const chunk of parseSse(body)) {
    applyChunk(state, chunk);
    onChunk?.(chunk, state);
  }
  const pending = findPendingApproval([state.message]);
  let status: TurnStatus = 'done';
  if (state.error) status = 'error';
  else if (state.aborted) status = 'aborted';
  else if (pending) status = 'approval-required';
  return { state, status, pending };
}

/** Send one message (a prompt or a plan decision) and stream the agent's reply. */
export async function runTurn(options: TurnOptions): Promise<TurnResult> {
  const message = buildMessage(options.input);
  const body = await options.api.sendMessage(
    options.sessionId,
    {
      type: 'message',
      teamId: options.teamId,
      planMode: options.planMode ?? true,
      messages: [message],
      ...(options.userContext && {
        userContext: JSON.stringify(options.userContext),
      }),
      ...(options.isNew && { surface: 'dashboard' as const }),
    },
    options.signal
  );
  // After a plan decision the server keeps streaming into the plan's message.
  const seed = 'approval' in options.input ? message : undefined;
  return consumeStream(body, options.onChunk, seed);
}
