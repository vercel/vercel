import chalk from 'chalk';
import output from '../../output-manager';
import { inline } from './markdown';
import { summarizeToolInput } from './render-stream';
import {
  actionVerb,
  agentLabel,
  blankGutter,
  gutter,
  GUTTER_WIDTH,
} from './voice';
import { textWidth, truncateAnsi, wrapAnsi } from './wrap';

/**
 * Render the conversation that happened in the agent's own interface into
 * ship's transcript, so the log reads as one continuous story across
 * interface switches.
 *
 * The messages come from the harness's `readHistory` — the adapter's
 * normalized view of the runtime's own persisted conversation — not from
 * scraping terminal output or asking the model to recall. Rendering follows
 * the transcript's standing rules: prose wraps into the text column, actions
 * carry a verb and are cut rather than folded, reasoning does not appear.
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
const MAX_LINES = 160;

/** Build the attributed lines. Pure, for tests; `printStint` writes them. */
export function formatStint(
  messages: ReadonlyArray<StintMessage>,
  options: { harnessId: string }
): string[] {
  const agent = agentLabel(options.harnessId);
  const width = textWidth(GUTTER_WIDTH);
  const lines: string[] = [];

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'text' && part.text) {
        if (message.role === 'user') {
          pushWrapped(lines, gutter('you', 'you'), part.text, width);
        } else {
          pushWrapped(lines, gutter('agent', agent), inline(part.text), width);
        }
        continue;
      }

      if (part.type === 'tool-call' && message.role === 'assistant') {
        const verb = actionVerb(part.toolName ?? 'tool');
        const summary =
          summarizeToolInput(part.input) || chalk.dim(part.toolName ?? 'tool');
        // Cut, never folded: the shape of a command is what is scanned for.
        lines.push(gutter('action', verb) + truncateAnsi(summary, width));
        continue;
      }

      if (part.type === 'tool-result' && part.isError) {
        lines.push(blankGutter() + chalk.red('failed'));
      }
    }
  }

  if (lines.length > MAX_LINES) {
    const omitted = lines.length - MAX_LINES;
    return [
      blankGutter() +
        chalk.dim(`… ${omitted} earlier lines — the agent has the full record`),
      ...lines.slice(-MAX_LINES),
    ];
  }
  return lines;
}

export function printStint(
  messages: ReadonlyArray<StintMessage>,
  options: { harnessId: string }
): void {
  for (const line of formatStint(messages, options)) {
    output.print(`${line}\n`);
  }
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

function pushWrapped(
  lines: string[],
  firstGutter: string,
  text: string,
  width: number
): void {
  const wrapped = wrapAnsi(text, width);
  for (const [index, line] of wrapped.entries()) {
    lines.push((index === 0 ? firstGutter : blankGutter()) + line);
  }
}
