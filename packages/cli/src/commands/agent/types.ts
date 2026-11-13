// Minimal local copy of the Vercel Agent wire contract: the request body, the session response,
// and AI SDK v6 UI message stream chunks.

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ReasoningPart {
  type: 'reasoning';
  text: string;
}

type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied';

export interface ToolPart {
  /** `tool-<ToolName>`, e.g. `tool-Bash`. */
  type: `tool-${string}`;
  toolCallId: string;
  state: ToolState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string; approved?: boolean };
}

interface UnknownPart {
  type: string;
  [key: string]: unknown;
}

export type MessagePart = TextPart | ReasoningPart | ToolPart | UnknownPart;

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: MessagePart[];
}

/** One `data:` chunk of the UI message stream. Unknown chunk types pass through. */
export interface StreamChunk {
  type: string;
  [key: string]: unknown;
}

export interface SessionMessageRequest {
  type: 'message';
  teamId: string;
  planMode: boolean;
  messages: AgentMessage[];
  userContext?: string;
  surface?: 'dashboard';
}

export interface SessionDetails {
  id: string;
  surface: string;
  messages: AgentMessage[];
  title?: string | null;
  streamingMessageId?: string | null;
  resumable: boolean;
  canSend: boolean;
  readOnly: boolean;
}

interface SessionSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  tags: { title?: string };
}

export interface SessionList {
  items: SessionSummary[];
  cursor: string | null;
}

export interface ProposePlanInput {
  title: string;
  summary?: string;
  tasks: {
    id: string;
    title: string;
    description?: string;
    scopes?: string[];
  }[];
}

/**
 * Page context sent with a message. The agent only sees `routeLabel`, `pathname`, `section`,
 * `params` and `scope`; `pageContext` only feeds suggestions.
 */
export interface UserContext {
  source?: string;
  routeLabel?: string;
  scope?: string;
  pathname?: string;
  params?: Record<string, string>;
}
