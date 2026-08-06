import chalk from 'chalk';
import output from '../../output-manager';
import { StreamRenderer } from './render-stream';
import { blankGutter, gutter, GUTTER_WIDTH } from './voice';
import { textWidth, wrapAnsi } from './wrap';

/**
 * Render the conversation that happened in the agent's own interface into
 * ship's transcript, so the log reads as one continuous story across
 * interface switches.
 *
 * The messages come from the harness's `readHistory` — the adapter's
 * normalized view of the runtime's own persisted conversation — not from
 * scraping terminal output or asking the model to recall. Rendering drives
 * the same `StreamRenderer` the live session uses, by translating history
 * parts into synthetic stream parts: prose gets the same line-at-a-time
 * markdown, blocks the same spacing and labelling, actions the same verbs —
 * a replayed stint and a streamed turn are indistinguishable on the page.
 * The one thing the renderer has no concept of is the user speaking, so
 * `you` lines are printed directly between renderer feeds.
 */
export interface StintMessage {
  role: 'user' | 'assistant';
  parts: ReadonlyArray<{
    type: string;
    text?: string;
    toolName?: string;
    input?: unknown;
    isError?: boolean;
  }>;
  at?: string;
}

/**
 * A stint is user-paced and usually short; one that is not gets its tail,
 * which is where the state the next turn builds on was reached.
 */
const MAX_MESSAGES = 80;

export function printStint(
  messages: ReadonlyArray<StintMessage>,
  options: { harnessId: string }
): void {
  const kept = messages.slice(-MAX_MESSAGES);
  if (kept.length < messages.length) {
    output.print(
      blankGutter() +
        chalk.dim(
          `… ${messages.length - kept.length} earlier exchanges — the agent has the full record`
        ) +
        '\n'
    );
  }

  // A private renderer: same pipeline, no activity line to fight, and its
  // per-turn counters cannot pollute the live session's.
  const renderer = new StreamRenderer();
  renderer.attribute(options.harnessId);
  renderer.beginTurn();

  // History tool results carry no call ids; replay settles calls in order.
  let nextCallId = 0;
  const openCalls: string[] = [];

  for (const message of kept) {
    for (const part of message.parts) {
      if (part.type === 'text' && part.text) {
        if (message.role === 'user') {
          renderer.flush();
          printYouSaid(part.text);
        } else {
          const text = part.text.endsWith('\n') ? part.text : `${part.text}\n`;
          renderer.render({ type: 'text-delta', text });
        }
        continue;
      }

      if (part.type === 'tool-call' && message.role === 'assistant') {
        const toolCallId = `replay-${++nextCallId}`;
        openCalls.push(toolCallId);
        renderer.render({
          type: 'tool-call',
          toolCallId,
          toolName: part.toolName ?? 'tool',
          input: part.input,
        });
        continue;
      }

      if (part.type === 'tool-result') {
        const toolCallId = openCalls.shift();
        if (toolCallId) {
          renderer.render({
            type: part.isError ? 'tool-error' : 'tool-result',
            toolCallId,
          });
        }
      }
    }
  }

  renderer.flush();
}

/** Count what the stint contained, for the session ledger. */
export function summarizeStint(messages: ReadonlyArray<StintMessage>): {
  userMessages: number;
  agentReplies: number;
  toolCalls: number;
} {
  let userMessages = 0;
  let agentReplies = 0;
  let toolCalls = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'text' && part.text) {
        if (message.role === 'user') userMessages += 1;
        else agentReplies += 1;
      } else if (part.type === 'tool-call') {
        toolCalls += 1;
      }
    }
  }
  return { userMessages, agentReplies, toolCalls };
}

/** The user's words, in the `you` gutter, set off like the approval prompts. */
function printYouSaid(text: string): void {
  output.print('\n');
  const lines = wrapAnsi(text, textWidth(GUTTER_WIDTH));
  for (const [index, line] of lines.entries()) {
    output.print(
      (index === 0 ? gutter('you', 'you') : blankGutter()) + line + '\n'
    );
  }
}
