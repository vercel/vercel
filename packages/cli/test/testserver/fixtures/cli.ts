import { spawn } from 'node:child_process';
import { getCliPath } from '../../helpers/get-cli-path';
import { setupTmpDir } from '../../helpers/setup-unit-fixture';
import type { ApiProxy } from './api-proxy';
import type { ArtifactRecorder, ProxyRequestRecord } from './artifacts';
import type { Authenticator } from './authenticator';
import { secs, type Progress } from './progress';

const HEARTBEAT_MS = 10_000;
// Below the lane's 60s testTimeout, so a hung command fails with its own
// output. Killing on the test's abort signal covers multi-command tests.
const DEFAULT_TIMEOUT_MS = 45_000;

// Runs the built CLI against the sandbox through the per-test proxy. Spawning
// follows test/e2e-single-file.test.ts; the argument handling comes from the
// 2026-10-19 spike (users/schrockn/objectives/cli-testserver-tier/updates/
// 2026-10-19-spike-cli-against-testserver.md).

export interface CliRunOptions {
  cwd?: string;
  /** `false` omits `--scope`; a string overrides the default team slug. */
  scope?: string | false;
  token?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface CliRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  /** Proxy requests recorded during this run. */
  requests: ProxyRequestRecord[];
}

export interface Cli {
  run: (args: string[], opts?: CliRunOptions) => Promise<CliRunResult>;
}

function quoteForLog(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function createCli({
  apiProxy,
  authenticator,
  artifacts,
  progress,
  signal,
}: {
  apiProxy: ApiProxy;
  authenticator: Authenticator;
  artifacts: ArtifactRecorder;
  progress: Progress;
  /** The test's signal. Vitest aborts it when the test times out. */
  signal: AbortSignal;
}): Cli {
  const cliPath = getCliPath();
  const useBinary = Boolean(process.env.VERCEL_CLI_TEST_BINARY);
  const globalConfig = setupTmpDir();

  const run: Cli['run'] = async (args, opts = {}) => {
    const token = opts.token ?? authenticator.current?.token.secretString;
    if (!token) {
      throw new Error(
        'call login() or authenticator.withTeam() before cli.run()'
      );
    }

    let scopeArgs: string[] = [];
    if (opts.scope !== false && !args.includes('--scope')) {
      const scope = opts.scope ?? authenticator.current?.team.slug;
      if (scope) scopeArgs = ['--scope', scope];
    }

    const fullArgs = [
      ...args,
      '--api',
      apiProxy.url,
      '--token',
      token,
      '--global-config',
      globalConfig,
      ...scopeArgs,
    ];

    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      CI: '1',
      NO_COLOR: '1',
      NO_UPDATE_NOTIFIER: '1',
      VERCEL_TELEMETRY_DISABLED: '1',
    };
    for (const key of ['SystemRoot', 'TEMP'] as const) {
      const value = process.env[key];
      if (value) env[key] = value;
    }
    Object.assign(env, opts.env);

    const cwd = opts.cwd ?? setupTmpDir();
    const requestsBefore = apiProxy.requests.length;
    const started = Date.now();

    // Show what the test runs, live. The fixture-added --api, --token and
    // --global-config are omitted; cli.json in the failure artifacts has them.
    const command = `vercel ${[...args, ...scopeArgs].map(quoteForLog).join(' ')}`;
    progress.log(`$ ${command} …`);
    const heartbeat = setInterval(() => {
      progress.log(
        `… still running ${command} (${secs(Date.now() - started)})`
      );
    }, HEARTBEAT_MS);

    const { exitCode, stdout, stderr } = await new Promise<{
      exitCode: number | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn(
        useBinary ? cliPath : process.execPath,
        useBinary ? fullArgs : [cliPath, ...fullArgs],
        { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      let out = '';
      let err = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (d: string) => {
        out += d;
      });
      child.stderr.on('data', (d: string) => {
        err += d;
      });
      const kill = () => child.kill('SIGKILL');
      const timer = setTimeout(kill, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      // Without this, a Vitest timeout leaves the CLI process running.
      if (signal.aborted) kill();
      else signal.addEventListener('abort', kill, { once: true });
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', kill);
      };
      child.on('error', error => {
        cleanup();
        reject(error);
      });
      child.on('close', code => {
        cleanup();
        resolve({ exitCode: code, stdout: out, stderr: err });
      });
    }).finally(() => clearInterval(heartbeat));

    const durationMs = Date.now() - started;
    const requests = apiProxy.requests.slice(requestsBefore);
    progress.log(
      `${exitCode === 0 ? '✓' : '✗'} exit ${exitCode} in ${secs(durationMs)}, ${requests.length} API request${requests.length === 1 ? '' : 's'}`
    );
    artifacts.phases.cliMs += durationMs;
    artifacts.phases.cliRuns += 1;
    artifacts.cliRuns.push({
      args: fullArgs,
      cwd,
      exitCode,
      stdout,
      stderr,
      durationMs,
    });

    return {
      exitCode,
      stdout,
      stderr,
      durationMs,
      requests,
    };
  };

  return { run };
}
