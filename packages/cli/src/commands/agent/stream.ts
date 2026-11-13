import type { ReadableStream } from 'node:stream/web';
import type {
  AgentMessage,
  MessagePart,
  ProposePlanInput,
  ReasoningPart,
  StreamChunk,
  TextPart,
  ToolPart,
} from './types';

/** Parse an SSE body into UI message stream chunks. Stops at `data: [DONE]`. */
export async function* parseSse(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<StreamChunk> {
  const decoder = new TextDecoder();
  let buffer = '';
  // A CR at the end of a chunk may be the first half of a CRLF; wait for the next chunk.
  let pendingCr = '';
  for await (const bytes of body) {
    let text = pendingCr + decoder.decode(bytes, { stream: true });
    pendingCr = text.endsWith('\r') ? '\r' : '';
    if (pendingCr) text = text.slice(0, -1);
    // SSE lines may end in CRLF, LF or CR.
    buffer += text.replace(/\r\n?/g, '\n');
    let index = buffer.indexOf('\n\n');
    while (index !== -1) {
      const event = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const data = event
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart())
        .join('\n');
      if (data === '[DONE]') return;
      if (data) yield JSON.parse(data) as StreamChunk;
      index = buffer.indexOf('\n\n');
    }
  }
}

export interface TurnState {
  /** Assistant message being built. */
  message: AgentMessage;
  title?: string;
  /** Latest short status line from the preamble model. */
  preamble?: string;
  finishReason?: string;
  error?: string;
  aborted: boolean;
  /** Text/reasoning parts still receiving deltas, keyed by `<type>:<chunk id>`. */
  streaming: Map<string, TextPart | ReasoningPart>;
}

/** `seed` is the assistant message the stream continues, e.g. after a plan approval. */
export function createTurnState(seed?: AgentMessage): TurnState {
  return {
    message: seed
      ? structuredClone(seed)
      : { id: '', role: 'assistant', parts: [] },
    aborted: false,
    streaming: new Map(),
  };
}

function findTool(state: TurnState, toolCallId: unknown): ToolPart | undefined {
  return state.message.parts.find(
    (p): p is ToolPart => isToolPart(p) && p.toolCallId === toolCallId
  );
}

function upsertTool(
  state: TurnState,
  chunk: StreamChunk,
  patch: Partial<ToolPart>
): void {
  const existing = findTool(state, chunk.toolCallId);
  if (existing) {
    Object.assign(existing, patch);
    return;
  }
  // An update for a call this state never saw (no seed); there is nothing to name it by.
  if (typeof chunk.toolName !== 'string') return;
  state.message.parts.push({
    type: `tool-${String(chunk.toolName)}`,
    toolCallId: String(chunk.toolCallId),
    state: 'input-streaming',
    ...patch,
  });
}

function openPart(
  state: TurnState,
  chunk: StreamChunk,
  type: 'text' | 'reasoning'
): TextPart | ReasoningPart {
  const part = { type, text: '' };
  state.message.parts.push(part);
  state.streaming.set(`${type}:${String(chunk.id)}`, part);
  return part;
}

function appendDelta(
  state: TurnState,
  chunk: StreamChunk,
  type: 'text' | 'reasoning'
): void {
  const part =
    state.streaming.get(`${type}:${String(chunk.id)}`) ??
    openPart(state, chunk, type);
  part.text += String(chunk.delta ?? '');
}

/** Apply one chunk to the turn state, mutating it. Mirrors AI SDK `readUIMessageStream`. */
export function applyChunk(state: TurnState, chunk: StreamChunk): void {
  switch (chunk.type) {
    case 'start':
      if (typeof chunk.messageId === 'string')
        state.message.id = chunk.messageId;
      break;
    case 'data-preamble':
      state.preamble = String((chunk.data as { text?: string })?.text ?? '');
      break;
    case 'data-title':
      state.title = String((chunk.data as { title?: string })?.title ?? '');
      break;
    case 'text-start':
      openPart(state, chunk, 'text');
      break;
    case 'text-delta':
      appendDelta(state, chunk, 'text');
      break;
    case 'text-end':
    case 'reasoning-end':
      state.streaming.delete(`${chunk.type.slice(0, -4)}:${String(chunk.id)}`);
      break;
    case 'reasoning-start':
      openPart(state, chunk, 'reasoning');
      break;
    case 'reasoning-delta':
      appendDelta(state, chunk, 'reasoning');
      break;
    case 'tool-input-start':
      upsertTool(state, chunk, { state: 'input-streaming' });
      break;
    case 'tool-input-available':
      upsertTool(state, chunk, {
        state: 'input-available',
        input: chunk.input,
      });
      break;
    case 'tool-input-error':
      upsertTool(state, chunk, {
        state: 'output-error',
        input: chunk.input,
        errorText: String(chunk.errorText ?? ''),
      });
      break;
    case 'tool-approval-request':
      upsertTool(state, chunk, {
        state: 'approval-requested',
        approval: {
          id: String(chunk.approvalId),
        },
      });
      break;
    case 'tool-output-available':
      upsertTool(state, chunk, {
        state: 'output-available',
        output: chunk.output,
      });
      break;
    case 'tool-output-error':
      upsertTool(state, chunk, {
        state: 'output-error',
        errorText: String(chunk.errorText ?? ''),
      });
      break;
    case 'tool-output-denied':
      upsertTool(state, chunk, { state: 'output-denied' });
      break;
    case 'error':
      state.error = String(chunk.errorText ?? 'Unknown error');
      break;
    case 'abort':
      state.aborted = true;
      break;
    case 'finish':
      state.finishReason =
        typeof chunk.finishReason === 'string' ? chunk.finishReason : 'stop';
      break;
  }
}

export function isToolPart(part: MessagePart): part is ToolPart {
  return part.type.startsWith('tool-') && 'toolCallId' in part;
}

export function toolName(part: ToolPart): string {
  return part.type.slice('tool-'.length);
}

/** Text after the last tool call: the agent's final answer, without interim "let me check…" text. */
export function finalText(message: AgentMessage): string {
  const lastTool = message.parts.findLastIndex(isToolPart);
  const pick = (parts: MessagePart[]): string =>
    parts
      .filter(p => p.type === 'text')
      .map(p => (p as { text: string }).text.trim())
      .filter(Boolean)
      .join('\n\n');
  return pick(message.parts.slice(lastTool + 1)) || pick(message.parts);
}

export interface PendingApproval {
  messageId: string;
  part: ToolPart;
  plan: ProposePlanInput;
}

/** The `ProposePlan` call awaiting the user's decision, if any. */
export function findPendingApproval(
  messages: AgentMessage[]
): PendingApproval | undefined {
  for (const message of messages.toReversed()) {
    const part = message.parts.find(
      (p): p is ToolPart =>
        isToolPart(p) &&
        toolName(p) === 'ProposePlan' &&
        p.state === 'approval-requested'
    );
    if (part)
      return {
        messageId: message.id,
        part,
        plan: part.input as ProposePlanInput,
      };
  }
}
