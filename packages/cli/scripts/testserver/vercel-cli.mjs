// Minting the vercel/vercel OIDC token with the `vercel` on PATH.
//
// The CLI reports a lapsed login as `You do not have access to the specified
// account`, so a failed mint is diagnosed: from its own output when that
// names the cause (no `vercel`, no network, an old CLI), else with one
// `vercel whoami`. A working mint costs one process.
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { OIDC_PROJECT, OIDC_TEAM } from './create-testserver.mjs';

const TIMEOUT_MS = 30_000;

const LOGIN_STEP = `\`vercel login\` with an account on the \`${OIDC_TEAM}\` team`;
export const LOGIN_FIX = `Run ${LOGIN_STEP}, then retry.`;
export const INSTALL_FIX = `Install it with \`npm i -g vercel@latest\`, run ${LOGIN_STEP}, then retry.`;
export const UPGRADE_FIX =
  'Upgrade it with `npm i -g vercel@latest`, then retry.';
export const NETWORK_FIX =
  'Check your network connection and any VPN or proxy, then retry.';

// What CLIs before 53.3.0 print for `project token --format=json`: 50.25.0
// to 53.2.x reject the flag, and older ones have no `project token`.
const OUTDATED =
  /unknown or unexpected option: --format|Please specify a valid subcommand/;

// The CLI's own connectivity errors (`… Please verify your internet
// connectivity …`) and the Node network errors that reach its output.
const UNREACHABLE =
  /internet connectivity|could not be resolved|\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH)\b|fetch failed|socket hang up/i;

/**
 * @typedef {{ ok: boolean; code?: number | string; stdout: string; stderr: string }} VercelResult
 * @typedef {(args: string[]) => Promise<VercelResult>} RunVercel
 */

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Run the `vercel` on PATH in a tmp dir, so a repo-local `.vercel` link or
 * `.env` stays out of the way. Never rejects: on failure, `code` is the exit
 * code, `ENOENT` when `vercel` is missing, or `TIMEOUT`.
 *
 * @param {string[]} args
 * @returns {Promise<VercelResult>}
 */
export async function runVercel(args, timeoutMs = TIMEOUT_MS) {
  try {
    const { stdout, stderr } = await promisify(execFile)('vercel', args, {
      cwd: tmpdir(),
      env: { ...process.env, NO_COLOR: '1', NO_UPDATE_NOTIFIER: '1' },
      timeout: timeoutMs,
      shell: process.platform === 'win32',
    });
    return { ok: true, stdout, stderr };
  } catch (err) {
    return {
      ok: false,
      // execFile kills the process when `timeout` elapses and sets `killed`.
      code: err.killed ? 'TIMEOUT' : err.code,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    };
  }
}

/**
 * The error a failed `vercel` printed: the JSON message `--format=json`
 * writes to stdout in non-interactive runs, else the `Error:` line of stderr.
 *
 * @param {VercelResult} result
 */
function errorText({ stdout, stderr }) {
  const json = parseJson(stdout);
  if (typeof json?.message === 'string') {
    return json.reason ? `${json.message} (${json.reason})` : json.message;
  }
  return (
    /^(?:> )?Error: (.*)$/m.exec(stderr)?.[1] ?? stderr.trim().split('\n').pop()
  );
}

/**
 * Mint a development OIDC token for vercel/vercel with the `vercel` on PATH
 * and its logged-in user. Tokens last 12 hours. Resolves to `{ token }`, or
 * `{ error, fix }` naming the cause and the fix; never rejects.
 *
 * @param {RunVercel} [run]
 * @returns {Promise<{ token: string } | { error: string; fix: string }>}
 */
export async function mintOidcToken(run = runVercel) {
  const mint = await run([
    'project',
    'token',
    OIDC_PROJECT,
    '--scope',
    OIDC_TEAM,
    '--format=json',
  ]);
  const token = mint.ok && parseJson(mint.stdout)?.token;
  if (typeof token === 'string' && token) return { token };

  const said = errorText(mint) || '`vercel project token` printed no token';
  const output = `${mint.stdout}\n${mint.stderr}`;
  if (mint.code === 'ENOENT') {
    return { error: '`vercel` is not on PATH', fix: INSTALL_FIX };
  }
  if (mint.code === 'TIMEOUT') {
    return {
      error: `\`vercel project token\` timed out after ${TIMEOUT_MS / 1000}s`,
      fix: NETWORK_FIX,
    };
  }
  if (UNREACHABLE.test(output)) {
    return {
      error: `\`vercel project token\` couldn't reach Vercel: ${said}`,
      fix: NETWORK_FIX,
    };
  }
  if (OUTDATED.test(output)) {
    return {
      error: `\`vercel\` on PATH is older than 53.3.0, the first with \`project token --format=json\`: ${said}`,
      fix: UPGRADE_FIX,
    };
  }

  // The mint reached Vercel, so a failing whoami means the login is bad.
  const whoami = await run(['whoami']);
  if (!whoami.ok) {
    return {
      error: `the saved \`vercel login\` is missing, expired or invalid (\`vercel whoami\`: ${errorText(whoami)}). \`vercel project token\` said: ${said}`,
      fix: LOGIN_FIX,
    };
  }
  const user =
    whoami.stdout.trim().split('\n').pop() || 'the logged-in account';
  return {
    error: `${said} (\`vercel whoami\` works, as ${user})`,
    fix: `Check that ${user} is a member of the \`${OIDC_TEAM}\` team, which owns the \`${OIDC_TEAM}/${OIDC_PROJECT}\` project. If it is, run ${LOGIN_STEP} again, then retry.`,
  };
}
