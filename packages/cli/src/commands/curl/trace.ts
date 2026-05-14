import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtemp, readFile, rm } from 'fs/promises';
import type Client from '../../util/client';
import output from '../../output-manager';
import { requoteArgs } from './utils';
import { confirmProduction, type DeploymentTarget } from './confirm-production';
import { getSessionToken } from './session-token-provider';
import type { CurlTelemetryClient } from '../../util/telemetry/commands/curl';
import type { Deployment, ProjectLinked } from '@vercel-internals/types';
import toHost from '../../util/to-host';
import getUser from '../../util/get-user';

const TRACE_COOKIE_NAME = '_vercel_tracing';
const SESSION_COOKIE_NAME = '_vercel_session';

export interface TraceOptions {
  /** Full resolved URL we are about to curl (e.g. https://my-app.vercel.app/api/x). */
  fullUrl: string;
  /**
   * Linked project context when available (linked dir or resolved from URL).
   * Used as the canonical source for project/team ids. When null, we fall
   * back to ids carried on the looked-up Deployment.
   */
  link: ProjectLinked | null;
  /** Existing curl flags (protection bypass header already injected if applicable). */
  curlFlags: string[];
  /** True when --json was set. JSON envelope to stdout, no stderr. */
  json: boolean;
  /** True when --yes was set. Skips production confirmation prompt. */
  yes: boolean;
  /** Telemetry client to report --trace and --yes-on-production flags. */
  telemetry: CurlTelemetryClient;
}

/**
 * Look up the deployment matching the URL we're about to curl. The deployment
 * carries both the canonical `id` (needed for the cookie API) and `target`
 * ('production' | 'staging' | null) used to gate the confirmation prompt.
 *
 * `accountId` is the team or user id; needed for the lookup to scope correctly.
 */
async function lookupDeployment(
  client: Client,
  fullUrl: string,
  accountId: string | undefined
): Promise<Deployment> {
  const host = toHost(fullUrl);
  return client.fetch<Deployment>(
    `/v13/deployments/${encodeURIComponent(host)}`,
    accountId ? { accountId } : {}
  );
}

/**
 * Pick the most authoritative team id available. Prefer the linked project's
 * org (set by `vercel link`); otherwise fall back to the deployment's owner
 * when it's a team-scoped account (`team_*`). Returns undefined for user
 * accounts so the API call is correctly scoped.
 */
function resolveTeamId(
  link: ProjectLinked | null,
  deployment: Deployment
): string | undefined {
  if (link?.org.type === 'team') {
    return link.org.id;
  }
  if (deployment.ownerId?.startsWith('team_')) {
    return deployment.ownerId;
  }
  return undefined;
}

/**
 * Parse the `x-vercel-id` value out of the curl-dumped header file.
 *
 * curl writes raw HTTP/1.1 response headers to the file (one header per line,
 * `name: value`, terminated by a blank line). We match case-insensitively
 * because curl preserves casing from the wire (often `x-vercel-id`).
 *
 * For requests that traverse multiple responses (redirects), curl writes
 * each response block sequentially; we return the LAST `x-vercel-id` so the
 * id reflects the final response the user actually consumed.
 */
function extractVercelId(headerDump: string): string | undefined {
  const lines = headerDump.split(/\r?\n/);
  let lastValue: string | undefined;
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    if (name === 'x-vercel-id') {
      lastValue = line.slice(idx + 1).trim();
    }
  }
  return lastValue;
}

/**
 * Parse the final HTTP status code from the curl header dump. Curl writes
 * one `HTTP/x.y <code> <reason>` line per response (including redirects),
 * so we take the LAST one as the status the user actually consumed.
 *
 * Returns undefined when curl produced no parseable status line (connection
 * failure, no response received, etc).
 */
function extractFinalStatus(headerDump: string): number | undefined {
  const lines = headerDump.split(/\r?\n/);
  let lastStatus: number | undefined;
  for (const line of lines) {
    const match = line.match(/^HTTP\/[\d.]+\s+(\d{3})/);
    if (match) {
      lastStatus = Number(match[1]);
    }
  }
  return lastStatus;
}

/**
 * Run curl with stdout inherited (so the user's pipe still works), and the
 * response headers dumped to a tmp file via `-D <path>`. This is the most
 * portable way to capture the `x-vercel-id` without disrupting the body.
 *
 * Returns the curl exit code along with the captured header dump (empty
 * string when curl could not produce one, e.g. on connection error).
 */
async function runCurlAndCaptureHeaders(
  curlFlags: string[],
  json: boolean
): Promise<{ exitCode: number; headerDump: string; capturedBody: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'vc-curl-trace-'));
  const headerFile = join(tmpDir, 'headers');

  // When --json is set we capture the body too so we can wrap it in the
  // envelope. Without --json the body streams to the user's stdout as today.
  const flags = ['--dump-header', headerFile, ...curlFlags];

  try {
    const { exitCode, capturedBody } = await new Promise<{
      exitCode: number;
      capturedBody: string;
    }>(resolve => {
      const child = spawn('curl', flags, {
        stdio: json ? ['inherit', 'pipe', 'inherit'] : 'inherit',
        shell: false,
      });

      let buf = '';
      if (json && child.stdout) {
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          buf += chunk;
        });
      }

      child.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          output.error('curl command not found. Please install curl.');
        } else {
          output.error(`Failed to execute curl: ${err.message}`);
        }
        resolve({ exitCode: 1, capturedBody: buf });
      });

      child.on('close', (code: number | null) => {
        resolve({ exitCode: code ?? 1, capturedBody: buf });
      });
    });

    let headerDump = '';
    try {
      headerDump = await readFile(headerFile, 'utf8');
    } catch (err) {
      output.debug(`Failed to read curl header dump: ${err}`);
    }

    return { exitCode, headerDump, capturedBody };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Orchestrates the --trace flow:
 *
 * 1. Look up the deployment (gives us deploymentId + production-or-not).
 * 2. Gate on production via {@link confirmProduction}.
 * 3. Acquire the session cookie via the on-disk-cached provider.
 * 4. Spawn curl with the cookie header AND `-D <tmpfile>` so we can
 *    capture `x-vercel-id` without disturbing body streaming.
 * 5. If the response was 401 AND the cookie came from cache, evict the
 *    cache entry, re-issue, and retry curl ONCE.
 * 6. Emit the request id (text mode) or wrap the response (JSON mode).
 */
export async function trace(
  client: Client,
  { fullUrl, link, curlFlags, json, yes, telemetry }: TraceOptions
): Promise<number> {
  telemetry.trackCliFlagTrace(true);
  if (json) {
    telemetry.trackCliFlagJson(true);
  }

  const accountId = link?.org.id;

  let deployment: Deployment;
  try {
    deployment = await lookupDeployment(client, fullUrl, accountId);
  } catch (err) {
    output.error(
      `Failed to look up deployment for tracing: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return 1;
  }

  const projectId = link?.project.id ?? deployment.projectId;
  if (!projectId) {
    output.error(
      'Could not resolve project for trace session. Run `vercel link` and retry.'
    );
    return 1;
  }

  const teamId = resolveTeamId(link, deployment);

  const deploymentTarget: DeploymentTarget =
    deployment.target === 'production' ? 'production' : 'preview';

  const confirmation = await confirmProduction(client, {
    deploymentTarget,
    yes,
    isTTY: !!client.stdin.isTTY,
  });

  if (confirmation === 'non-tty-no-yes') {
    return 1;
  }

  if (confirmation === 'declined') {
    output.log('Trace cancelled.');
    return 0;
  }

  if (deploymentTarget === 'production' && yes) {
    telemetry.trackCliFlagYesOnProduction(true);
  }

  let userId: string;
  try {
    userId = client.authConfig.userId ?? (await getUser(client)).id;
  } catch (err) {
    output.error(
      `Failed to resolve user for trace session: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return 1;
  }

  let session;
  try {
    session = await getSessionToken({
      client,
      teamId,
      projectId,
      deploymentId: deployment.id,
      host: fullUrl,
    });
  } catch (err) {
    output.error(
      `Failed to acquire trace session: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return 1;
  }

  let { exitCode, headerDump, capturedBody } = await runCurlWithCookie(
    session.token,
    userId,
    curlFlags,
    json
  );

  // 401 retry: only if the token came from the cache (a stale cached cookie
  // is the only situation where evicting + re-issuing would help). A 401 on
  // a freshly issued token is a real failure and gets surfaced as-is.
  if (
    session.fromCache &&
    extractFinalStatus(headerDump) === 401 &&
    exitCode === 0
  ) {
    output.debug('Trace cookie returned 401; evicting cache and retrying.');
    let refreshed;
    try {
      refreshed = await getSessionToken({
        client,
        teamId,
        projectId,
        deploymentId: deployment.id,
        host: fullUrl,
        evictedToken: session.token,
      });
    } catch (err) {
      output.error(
        `Failed to refresh trace session after 401: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return 1;
    }

    ({ exitCode, headerDump, capturedBody } = await runCurlWithCookie(
      refreshed.token,
      userId,
      curlFlags,
      json
    ));
  }

  const requestId = extractVercelId(headerDump);

  if (json) {
    client.stdout.write(
      `${JSON.stringify({ response: capturedBody, requestId: requestId ?? null }, null, 2)}\n`
    );
    return requestId ? exitCode : exitCode === 0 ? 1 : exitCode;
  }

  if (!requestId) {
    // Curl ran but the response did not carry an x-vercel-id header (e.g.,
    // the request was served by an upstream that isn't Vercel, or curl
    // failed before receiving any headers).
    output.error(
      'Trace cookie was set but the response did not include an x-vercel-id header.'
    );
    return exitCode === 0 ? 1 : exitCode;
  }

  client.stderr.write(`Trace request id: ${requestId}\n`);
  client.stderr.write(
    `Run \`vercel traces get ${requestId}\` to fetch the trace.\n`
  );

  return exitCode;
}

/**
 * Inject the trace + session cookie header and run curl. Extracted so the
 * 401-retry path can re-invoke without duplicating flag-building logic.
 *
 * The session cookie is required server-side to associate the request with
 * the authenticated user and actually generate a trace.
 */
async function runCurlWithCookie(
  token: string,
  userId: string,
  curlFlags: string[],
  json: boolean
): Promise<{ exitCode: number; headerDump: string; capturedBody: string }> {
  const flagsWithCookie = [
    '--header',
    `Cookie: ${TRACE_COOKIE_NAME}=${token}; ${SESSION_COOKIE_NAME}=${userId}`,
    ...curlFlags,
  ];

  output.debug(`Executing: curl ${flagsWithCookie.map(requoteArgs).join(' ')}`);

  return runCurlAndCaptureHeaders(flagsWithCookie, json);
}
