// Create a Testserver sandbox and optionally write its config to disk.
//
// Port of vercel/front tooling/scripts/create-testserver.ts (at 185cfac41a9).
//
// Usage (CLI entry, used by CI):
//   node scripts/testserver/create-testserver.mjs [--build=<b>] [--timeout=<min>] [--output=<path>]
// The OIDC token comes from VERCEL_TRUSTED_OIDC_IDP_TOKEN or VERCEL_OIDC_TOKEN.
// The local wrapper (main.mjs) mints one with
// `mintOidcToken` (vercel-cli.mjs) when neither is set.
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const CREATE_URL = 'https://testserver.vercel.sh/create-testserver';
const MAX_ATTEMPTS = 3;
const STREAM_TIMEOUT_MS = 3 * 60 * 1000;

export function getTrustedOidcToken(env = process.env) {
  return env.VERCEL_TRUSTED_OIDC_IDP_TOKEN || env.VERCEL_OIDC_TOKEN || '';
}

// vercel/vercel is the project linked to vercel/vercel-internal. Testserver's
// deployment protection trusts its development OIDC tokens (Trusted Sources ->
// Projects), and runner sandboxes and snapshots belong to it.
export const OIDC_TEAM = 'vercel';
export const OIDC_PROJECT = 'vercel';

/**
 * True for statuses that mean the token was refused: a 401 or 403, or a 3xx,
 * which is Vercel Authentication redirecting to SSO. Retrying can't fix these.
 */
export function isAuthRejection(status) {
  return (
    typeof status === 'number' &&
    ((status >= 300 && status < 400) || status === 401 || status === 403)
  );
}

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

// undici `cause.code` values for a connection that was never established, so
// the request never reached the server.
const CONNECT_FAILURE_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/**
 * True when `fetch` failed before connecting. Only these are safe to retry: any
 * later failure (a reset, a timeout, a dropped stream) may come after the
 * server created a sandbox, and a retry would orphan it until its TTL expires.
 */
export function isConnectFailure(err) {
  return err instanceof TypeError && CONNECT_FAILURE_CODES.has(err.cause?.code);
}

async function readSandboxConfig(response, logPrefix, quiet) {
  if (!response.body) {
    throw new Error('Testserver create response has no body');
  }
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';

  // Returns the sandbox config event, or undefined for any other line.
  const handleLine = line => {
    if (!line.startsWith('data:')) return undefined;
    const payload = line.slice('data:'.length).trim();
    if (!payload) return undefined;
    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      return undefined;
    }
    if (event && typeof event === 'object') {
      if (typeof event.error !== 'undefined') {
        throw new Error(
          `Testserver create failed: ${
            typeof event.error === 'string'
              ? event.error
              : JSON.stringify(event.error)
          }`
        );
      }
      if (typeof event.testserverUrl === 'string') {
        return event;
      }
      if (!quiet && typeof event.message !== 'undefined') {
        console.error(`${logPrefix} ${event.message}`);
      }
    }
    return undefined;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          // Return as soon as the config arrives. The server may hold the
          // stream open, and waiting for it to close would time out.
          const result = handleLine(line);
          if (result) return result;
        }
      }
      if (done) break;
    }
    buffer += decoder.decode();
    const result = buffer ? handleLine(buffer) : undefined;
    if (result) return result;
  } finally {
    // Release the connection whether we returned early or failed.
    reader.cancel().catch(() => {});
  }
  throw new Error('Testserver create stream ended without a sandbox config');
}

async function attempt(url, trustedOidcToken, logPrefix, quiet) {
  const signal = AbortSignal.timeout(STREAM_TIMEOUT_MS);
  const response = await fetch(url, {
    headers: { 'x-vercel-trusted-oidc-idp-token': trustedOidcToken },
    redirect: 'manual',
    signal,
  });
  if (response.status >= 300 && response.status < 400) {
    throw new HttpError(
      `Vercel Authentication rejected the request (status ${
        response.status
      }, x-vercel-id ${response.headers.get('x-vercel-id') ?? 'unknown'})`,
      response.status
    );
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new HttpError(
      `Testserver create failed with HTTP ${response.status}: ${body.slice(
        0,
        200
      )}`,
      response.status
    );
  }
  return readSandboxConfig(response, logPrefix, quiet);
}

function toFlatConfig(result, timeoutMinutes) {
  const { config: rawConfig, ...rest } = result;
  const config = { ...(rawConfig ?? {}) };
  const localstackLogs = config.logs || '';
  delete config.logs;
  return {
    testserver: rest.testserverUrl,
    dynamodbAdmin: rest.dynamodbAdminUrl,
    testserverLogs: rest.logsUrl,
    blobPath: `${rest.blobUrl}/${rest.blobPath}.tar.gz`,
    created: new Date().toISOString(),
    ttl: timeoutMinutes * 60,
    localstackLogs,
    ...config,
  };
}

/**
 * Create a sandbox. Returns front's flat config shape and writes it to
 * `outputPath` when given. `logPrefix` starts each log line, which tells
 * parallel creations apart; `quiet` drops the server's progress messages.
 *
 * @param {{
 *   build?: string,
 *   timeoutMinutes?: number,
 *   outputPath?: string,
 *   trustedOidcToken?: string,
 *   logPrefix?: string,
 *   quiet?: boolean,
 * }} [options]
 */
export async function createTestserver({
  build,
  timeoutMinutes = 30,
  outputPath,
  trustedOidcToken,
  logPrefix = '[testserver]',
  quiet = false,
} = {}) {
  if (!trustedOidcToken) {
    throw new Error(
      'Missing OIDC token: set VERCEL_TRUSTED_OIDC_IDP_TOKEN or VERCEL_OIDC_TOKEN'
    );
  }
  const url = new URL(CREATE_URL);
  if (build) url.searchParams.set('build', build);
  url.searchParams.set('timeout', String(timeoutMinutes));

  let lastError;
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    try {
      const result = await attempt(url, trustedOidcToken, logPrefix, quiet);
      const flat = toFlatConfig(result, timeoutMinutes);
      if (outputPath) {
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, `${JSON.stringify(flat, null, 2)}\n`);
      }
      return flat;
    } catch (err) {
      lastError = err;
      // Retry only when the request never reached the server.
      if (!isConnectFailure(err)) throw err;
      if (i < MAX_ATTEMPTS) {
        console.error(
          `${logPrefix} create attempt ${i}/${MAX_ATTEMPTS} failed: ${
            err.cause.message || err.cause.code
          }; retrying`
        );
      }
    }
  }
  throw lastError;
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const match = /^--(build|timeout|output)=(.*)$/.exec(arg);
    if (!match) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    out[match[1]] = match[2];
  }
  return out;
}

// Node resolves symlinks in import.meta.url but not in argv[1], so compare
// real paths: run through a symlink (e.g. /tmp on macOS), a plain comparison
// fails and the script exits 0 without running anything.
const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const config = await createTestserver({
      build: args.build || process.env.TESTSERVER_BUILD || undefined,
      timeoutMinutes: args.timeout ? Number(args.timeout) : undefined,
      outputPath: args.output,
      trustedOidcToken: getTrustedOidcToken(),
    });
    console.log(JSON.stringify(config, null, 2));
  } catch (err) {
    console.error(`[testserver] ${err?.message ?? err}`);
    process.exit(1);
  }
}
