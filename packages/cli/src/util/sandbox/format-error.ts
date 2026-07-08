import { APIError, StreamError } from '@vercel/sandbox';
import chalk from 'chalk';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';

const ApiErrorResponse = z.object({
  error: z.object({
    message: z.string(),
  }),
});

export async function formatSandboxError(
  error: unknown
): Promise<string | null> {
  if (error instanceof APIError) {
    return formatApiError(error);
  }
  if (error instanceof StreamError) {
    return formatStreamError(error);
  }
  if (isApiTimeoutError(error)) {
    return formatApiTimeoutError();
  }
  return null;
}

async function formatApiError(error: APIError<unknown>): Promise<string> {
  const tmpPath = await writeResponseToTemp(error);
  const status = error.response.status;
  const parsedError = ApiErrorResponse.safeParse(error.json);
  const message = parsedError.data?.error.message ?? getErrorMessage(status);
  const lines = [
    message,
    `├▶ requested url: ${error.response.url}`,
    `├▶ status code: ${status} ${error.response.statusText}`,
    `╰▶ ${chalk.bold('hint:')} the full response buffer is stored in ${chalk.italic(tmpPath)}`,
  ];
  return lines.join('\n');
}

function getErrorMessage(status: number): string {
  if (status === 400) {
    return 'Sandbox API request failed: the request was invalid (400). Check the command arguments and try again.';
  }
  if (status === 401 || status === 403) {
    return 'Sandbox API request failed due to authentication. Check your token or run `vercel login`.';
  }
  if (status === 404) {
    return 'Sandbox API request failed: resource not found.';
  }
  if (status === 429) {
    return 'Sandbox API rate limit exceeded (429). Please wait and try again.';
  }
  if (status >= 500) {
    return 'Sandbox API responded with a server error. Please try again.';
  }
  return 'Sandbox API request failed.';
}

async function writeResponseToTemp({
  response,
  text,
}: APIError<unknown>): Promise<string> {
  const unique = [process.pid, process.hrtime.bigint()]
    .map(x => x.toString(36))
    .join('');
  const tmpPath = Path.join(tmpdir(), `sandbox-cli-response-${unique}.http`);

  const buffers = [] as Buffer[];
  buffers.push(Buffer.from(`${response.url}\r\n`));
  buffers.push(Buffer.from(`${response.status} ${response.statusText}\r\n`));
  for (const [key, value] of response.headers) {
    buffers.push(Buffer.from(`${key}: ${value}\r\n`));
  }
  buffers.push(Buffer.from(`\r\n`));
  if (text) {
    buffers.push(Buffer.from(text));
  }

  await writeFile(
    tmpPath,
    Buffer.concat(
      buffers as unknown as readonly Uint8Array[]
    ) as unknown as Uint8Array
  );
  return tmpPath;
}

function isApiTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const e = error as {
    name?: string;
    code?: string;
    message?: string;
    cause?: unknown;
  };
  if (e.name === 'TimeoutError' || e.name === 'AbortError') {
    return true;
  }
  if (e.code === 'ETIMEDOUT') {
    return true;
  }

  const causeCode = (e.cause as { code?: string } | undefined)?.code;
  if (
    causeCode === 'UND_ERR_CONNECT_TIMEOUT' ||
    causeCode === 'UND_ERR_HEADERS_TIMEOUT'
  ) {
    return true;
  }

  if (e.name === 'TypeError' && e.message === 'fetch failed') {
    return isApiTimeoutError(e.cause);
  }
  return false;
}

function formatApiTimeoutError(): string {
  return [
    'The request to the Sandbox API timed out.',
    `╰▶ ${chalk.bold('hint:')} check your network connection and try again.`,
  ].join('\n');
}

function formatStreamError(error: StreamError): string {
  return [
    'The sandbox stream was interrupted.',
    `├▶ code: ${error.code}`,
    `├▶ session: ${error.sessionId}`,
    `╰▶ ${chalk.bold('hint:')} the sandbox may have stopped. Resume or recreate it and try again.`,
  ].join('\n');
}
