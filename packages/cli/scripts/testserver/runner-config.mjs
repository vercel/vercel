// The Testserver runner's settings: whether a run uses a runner at all, its
// size and timeout, and its credentials. Read by main.mjs before any setup.
import { RunnerError } from './files.mjs';

const DEFAULT_RUNNER_TIMEOUT_MINUTES = 60;
const MAX_RUNNER_VCPUS = 16;
const MIN_RUNNER_VCPUS = 2;
// Each Testserver sandbox gets 4 Vitest workers, each spawning CLI processes:
// about 1.2 GB, so 2 vCPUs (4 GB) per sandbox.
const VCPUS_PER_SANDBOX = 2;
// The in-runner CLI build's floor: a cold build takes about as long on 8
// vCPUs as on 16, and 2–3 times as long on 2.
const RUNNER_BUILD_MIN_VCPUS = 8;

/** vCPUs for a runner that only tests, serving `sandboxCount` sandboxes. */
export function testRunnerVcpus(sandboxCount) {
  return Math.min(
    MAX_RUNNER_VCPUS,
    Math.max(MIN_RUNNER_VCPUS, VCPUS_PER_SANDBOX * sandboxCount)
  );
}

/**
 * vCPUs for a runner that builds the CLI and then tests against
 * `sandboxCount` sandboxes: at least 8 for the build, more when the tests
 * need it.
 */
export function buildRunnerVcpus(sandboxCount) {
  return Math.max(RUNNER_BUILD_MIN_VCPUS, testRunnerVcpus(sandboxCount));
}

export const LOCAL_HINT =
  'Set TESTSERVER_RUNNER=local to run the tests on this machine instead.';

export const LOCAL_BUILD_HINT =
  'Or set TESTSERVER_RUNNER_BUILD=local to build the CLI on this machine and test it in the runner.';

function parseIpv4(host) {
  const parts = host.split('.');
  if (parts.length !== 4) return undefined;
  const nums = parts.map(p => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return nums.every(n => n >= 0 && n <= 255) ? nums : undefined;
}

function isPrivateIpv4([a, b]) {
  return (
    a === 127 ||
    a === 10 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

/**
 * True when a runner sandbox can't reach `url`: loopback, private, link-local
 * or `.local`/`.localhost` hosts. An unparseable URL counts as unreachable.
 */
export function isPrivateOrLoopbackUrl(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    return true;
  }
  const v4 = parseIpv4(host);
  if (v4) return isPrivateIpv4(v4);
  if (host.includes(':')) {
    if (host === '::1' || host === '::') return true;
    // IPv4-mapped (::ffff:7f00:1 after URL normalization).
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
    if (mapped) {
      const hi = parseInt(mapped[1], 16);
      const lo = parseInt(mapped[2], 16);
      return isPrivateIpv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
    }
    // fc00::/7 (unique local) and fe80::/10 (link-local).
    return /^f[cd]/.test(host) || /^fe[89ab]/.test(host);
  }
  return false;
}

/**
 * Runner settings from the environment, checked before any setup.
 * Throws RunnerError on a bad TESTSERVER_RUNNER (always), and, unless the
 * environment forces a local run, on a bad TESTSERVER_RUNNER_TIMEOUT_MINUTES
 * or a partial TESTSERVER_RUNNER_* override.
 * → { mode: 'local', reason }
 *   | { mode: 'runner', build, timeoutMs, override }
 *   build: 'runner' | 'local', from TESTSERVER_RUNNER_BUILD (default runner)
 *   override: { token, teamId, projectId } | undefined
 */
export function readRunnerConfig(env) {
  const setting = env.TESTSERVER_RUNNER;
  if (setting && setting !== 'local' && setting !== 'sandbox') {
    throw new RunnerError(
      `TESTSERVER_RUNNER must be \`local\` or \`sandbox\`, got \`${setting}\``
    );
  }
  if (env.CI) return { mode: 'local', reason: 'CI is set' };
  if (setting === 'local') {
    return { mode: 'local', reason: 'TESTSERVER_RUNNER=local' };
  }
  // The runner tests the uploaded dist/; a host binary wouldn't run there.
  if (env.VERCEL_CLI_TEST_BINARY) {
    return { mode: 'local', reason: 'VERCEL_CLI_TEST_BINARY is set' };
  }
  return {
    mode: 'runner',
    build: runnerBuild(env),
    timeoutMs: runnerTimeoutMs(env),
    override: runnerOverride(env),
  };
}

/** Why `bases` can't use a runner, or undefined when they can. */
export function runnerUnreachableReason(bases) {
  if (bases.length === 0) return 'no Testserver sandbox';
  const unreachable = bases.find(isPrivateOrLoopbackUrl);
  return unreachable
    ? `${unreachable} is not reachable from a runner sandbox`
    : undefined;
}

/**
 * Where a runner run builds the CLI, from TESTSERVER_RUNNER_BUILD: `runner`
 * (the default) or `local`, which builds on this machine and uploads dist/.
 * Each value names a build mode in main.mjs's BUILD_MODES.
 */
export function runnerBuild(env) {
  const raw = env.TESTSERVER_RUNNER_BUILD;
  if (raw === undefined || raw === '' || raw === 'runner') return 'runner';
  if (raw === 'local') return 'local';
  throw new RunnerError(
    `TESTSERVER_RUNNER_BUILD must be \`runner\` or \`local\`, got \`${raw}\``
  );
}

/** Runner timeout in ms, from TESTSERVER_RUNNER_TIMEOUT_MINUTES (default 60). */
export function runnerTimeoutMs(env) {
  const raw = env.TESTSERVER_RUNNER_TIMEOUT_MINUTES;
  if (raw === undefined || raw === '') {
    return DEFAULT_RUNNER_TIMEOUT_MINUTES * 60_000;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new RunnerError(
      `TESTSERVER_RUNNER_TIMEOUT_MINUTES must be a positive integer, got \`${raw}\``
    );
  }
  return n * 60_000;
}

const OVERRIDE_VARS = [
  'TESTSERVER_RUNNER_TOKEN',
  'TESTSERVER_RUNNER_TEAM_ID',
  'TESTSERVER_RUNNER_PROJECT_ID',
];

/** TESTSERVER_RUNNER_* when all set; undefined when none; throws when partial. */
export function runnerOverride(env) {
  const set = OVERRIDE_VARS.filter(name => env[name]);
  if (set.length === 0) return undefined;
  if (set.length < OVERRIDE_VARS.length) {
    const missing = OVERRIDE_VARS.filter(name => !env[name]);
    throw new RunnerError(
      `Runner credential override is incomplete: ${set.join(', ')} set but ${missing.join(', ')} missing. Set all three or none.`
    );
  }
  return {
    token: env.TESTSERVER_RUNNER_TOKEN,
    teamId: env.TESTSERVER_RUNNER_TEAM_ID,
    projectId: env.TESTSERVER_RUNNER_PROJECT_ID,
  };
}

function decodeJwtPayload(token) {
  const part = token.split('.')[1];
  if (!part) return undefined;
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

/** Team and project from a Vercel OIDC token's payload (decoded, not verified). */
export function credentialsFromOidc(token) {
  const payload = decodeJwtPayload(token);
  if (
    typeof payload?.owner_id !== 'string' ||
    typeof payload?.project_id !== 'string'
  ) {
    throw new RunnerError(
      'The OIDC token has no owner_id/project_id; it is not a Vercel OIDC token.'
    );
  }
  return { token, teamId: payload.owner_id, projectId: payload.project_id };
}
