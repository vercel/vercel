import chalk from 'chalk';
import type Client from '../../util/client';
import type { Response } from '../../util/fetch';
import output from '../../output-manager';

export interface StreamPart {
  type: string;
  [key: string]: unknown;
}

export type AskOutputMode = 'text' | 'verbose' | 'json';

export interface TurnStreamResult {
  status: 'finished' | 'error' | 'dispatched' | 'incomplete';
  errorText?: string;
  answerText: string;
}

const MAX_TOOL_PREVIEW_LENGTH = 120;

/**
 * Parses the AI SDK UI message SSE stream (`data: <json>` events terminated
 * by `data: [DONE]`) into individual stream parts.
 */
export async function* parseUIMessageStream(
  response: Response
): AsyncGenerator<StreamPart> {
  const body = response.body;
  if (!body) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');

        if (!line.startsWith('data:')) {
          continue;
        }
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') {
          continue;
        }
        let part: StreamPart;
        try {
          part = JSON.parse(data) as StreamPart;
        } catch {
          output.debug(`Skipping unparseable stream part: ${data}`);
          continue;
        }
        yield part;
      }
    }
  } finally {
    // Releases the connection when the caller stops consuming early
    // (e.g. --no-wait). The agent turn continues server-side.
    reader.cancel().catch(() => undefined);
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function formatToolInput(input: unknown): string {
  if (input === undefined || input === null) {
    return '';
  }
  try {
    return truncate(JSON.stringify(input), MAX_TOOL_PREVIEW_LENGTH);
  } catch {
    return '';
  }
}

function readString(part: StreamPart, key: string): string | undefined {
  const value = part[key];
  return typeof value === 'string' ? value : undefined;
}

function formatStatusData(data: unknown): string | undefined {
  if (typeof data === 'string') {
    return data;
  }
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const key of ['title', 'text', 'status', 'message']) {
      if (typeof record[key] === 'string') {
        return record[key];
      }
    }
  }
  return undefined;
}

/**
 * Consumes an agent turn stream and renders it according to the output mode:
 *
 * - `text`: the answer text streams to stdout; everything else is hidden
 *   behind a spinner on stderr.
 * - `verbose`: like `text`, but reasoning and tool activity render to stderr.
 * - `json`: every stream part is emitted as a JSON line on stdout.
 */
export async function consumeTurnStream(
  response: Response,
  opts: {
    client: Client;
    mode: AskOutputMode;
    /** Stop consuming once the turn has started (used by --no-wait). */
    stopAfterStart?: boolean;
  }
): Promise<TurnStreamResult> {
  const { client, mode } = opts;

  let answerText = '';
  let errorText: string | undefined;
  let sawFinish = false;
  let sawAbort = false;
  let stoppedAfterStart = false;
  /** Set when the last stderr write did not end with a newline. */
  let openStderrLine = false;
  const toolNamesByCallId = new Map<string, string>();

  const writeAnswer = (text: string) => {
    output.stopSpinner();
    client.stdout.write(text);
  };

  const endOpenStderrLine = () => {
    if (openStderrLine) {
      output.print('\n');
      openStderrLine = false;
    }
  };

  try {
    for await (const part of parseUIMessageStream(response)) {
      if (mode === 'json') {
        client.stdout.write(`${JSON.stringify(part)}\n`);
      }

      switch (part.type) {
        case 'start': {
          if (opts.stopAfterStart) {
            stoppedAfterStart = true;
          }
          break;
        }
        case 'text-start': {
          if (mode !== 'json') {
            endOpenStderrLine();
            if (answerText.length > 0) {
              writeAnswer('\n\n');
              answerText += '\n\n';
            }
          }
          break;
        }
        case 'text-delta': {
          const delta = readString(part, 'delta') ?? '';
          if (delta && mode !== 'json') {
            writeAnswer(delta);
          }
          answerText += delta;
          break;
        }
        case 'reasoning-delta': {
          if (mode === 'verbose') {
            const delta = readString(part, 'delta') ?? '';
            if (delta) {
              output.print(chalk.dim(delta));
              openStderrLine = !delta.endsWith('\n');
            }
          }
          break;
        }
        case 'reasoning-end': {
          if (mode === 'verbose') {
            endOpenStderrLine();
          }
          break;
        }
        case 'tool-input-available': {
          const toolCallId = readString(part, 'toolCallId');
          const toolName = readString(part, 'toolName') ?? 'tool';
          if (toolCallId) {
            toolNamesByCallId.set(toolCallId, toolName);
          }
          if (mode === 'verbose') {
            endOpenStderrLine();
            output.log(
              `${chalk.cyan(toolName)} ${chalk.gray(formatToolInput(part.input))}`
            );
          }
          break;
        }
        case 'tool-output-error': {
          if (mode === 'verbose') {
            const toolCallId = readString(part, 'toolCallId');
            const toolName =
              (toolCallId && toolNamesByCallId.get(toolCallId)) || 'tool';
            endOpenStderrLine();
            output.log(
              chalk.red(
                `${toolName} failed: ${readString(part, 'errorText') ?? 'unknown error'}`
              )
            );
          }
          break;
        }
        case 'error': {
          errorText = readString(part, 'errorText') ?? 'The agent turn failed';
          break;
        }
        case 'abort': {
          sawAbort = true;
          break;
        }
        case 'finish': {
          sawFinish = true;
          break;
        }
        default: {
          if (mode === 'verbose' && part.type.startsWith('data-')) {
            const status = formatStatusData(part.data);
            if (status) {
              endOpenStderrLine();
              output.log(chalk.gray(status));
            }
          }
          break;
        }
      }

      if (stoppedAfterStart) {
        break;
      }
    }
  } catch (error) {
    output.stopSpinner();
    return {
      status: 'incomplete',
      errorText: error instanceof Error ? error.message : String(error),
      answerText,
    };
  }

  output.stopSpinner();
  if (mode !== 'json' && answerText.length > 0 && !answerText.endsWith('\n')) {
    client.stdout.write('\n');
  }

  if (stoppedAfterStart) {
    return { status: 'dispatched', answerText };
  }
  if (errorText) {
    return { status: 'error', errorText, answerText };
  }
  if (sawAbort) {
    return {
      status: 'error',
      errorText: 'The agent turn was interrupted',
      answerText,
    };
  }
  if (sawFinish) {
    return { status: 'finished', answerText };
  }
  return {
    status: 'incomplete',
    errorText: 'The agent stream ended unexpectedly',
    answerText,
  };
}
