import { readFileSync } from 'node:fs';
import type Client from '../../util/client';
import { canPrompt } from '../../util/can-prompt';
import { outputError } from '../../util/command-validation';

interface ReadableStdin {
  isTTY?: boolean;
  setEncoding(encoding: string): unknown;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
}

/**
 * Read piped stdin to EOF. The shared `readStandardInput` util resolves on
 * the FIRST data event, silently truncating multi-chunk input — fine for
 * env values, not for comment bodies posted to a remote mutation. Keeps the
 * 500ms no-data window so an open-but-silent stdin doesn't hang.
 */
export function readAllStandardInput(stdin: ReadableStdin): Promise<string> {
  if (stdin.isTTY) {
    return Promise.resolve('');
  }
  return new Promise(resolve => {
    const chunks: string[] = [];
    const timer = setTimeout(() => {
      if (chunks.length === 0) {
        cleanup();
        resolve('');
      }
    }, 500);
    const onData = (chunk: unknown) => {
      chunks.push(String(chunk));
    };
    const onEnd = () => {
      cleanup();
      resolve(chunks.join(''));
    };
    function cleanup() {
      clearTimeout(timer);
      stdin.off('data', onData);
      stdin.off('end', onEnd);
    }
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    stdin.on('end', onEnd);
  });
}

export interface ContentFlags {
  message?: string;
  file?: string;
  hasAttachments?: boolean;
}

/**
 * Shared content input for reply/edit. Rules:
 * 1. At most one of --message / --file.
 * 2. `--file -` or piped stdin reads standard input.
 * 3. Interactive with no content: one-line prompt.
 * 4. Non-interactive with no content: error — unless attachments are
 *    present (attachment-only messages are valid per the API).
 *
 * Returns the markdown string, undefined for attachment-only, or an exit
 * code on error.
 */
export async function resolveMessageContent(
  client: Client,
  flags: ContentFlags,
  jsonOutput: boolean
): Promise<string | undefined | number> {
  if (flags.message !== undefined && flags.file !== undefined) {
    return outputError(
      client,
      jsonOutput,
      'CONFLICTING_CONTENT',
      'Use either --message or --file, not both.'
    );
  }

  if (flags.message !== undefined) {
    return flags.message;
  }

  if (flags.file !== undefined) {
    if (flags.file === '-') {
      const piped = await readAllStandardInput(client.stdin);
      if (piped) {
        return piped;
      }
      return outputError(
        client,
        jsonOutput,
        'MISSING_CONTENT',
        'No content received on stdin for `--file -`.'
      );
    }
    try {
      return readFileSync(flags.file, 'utf8');
    } catch (err: unknown) {
      return outputError(
        client,
        jsonOutput,
        'FILE_READ_ERROR',
        `Could not read ${flags.file}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const piped = await readAllStandardInput(client.stdin);
  if (piped) {
    return piped;
  }

  if (flags.hasAttachments) {
    return undefined;
  }

  if (canPrompt(client) && !jsonOutput) {
    const text = await client.input.text({ message: 'Comment message:' });
    if (text) {
      return text;
    }
  }

  return outputError(
    client,
    jsonOutput,
    'MISSING_CONTENT',
    'No content provided. Pass -m <text>, --file <path>, or pipe stdin (e.g. `echo "LGTM" | vercel comments reply <thread>`).'
  );
}
