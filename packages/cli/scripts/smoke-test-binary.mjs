import { spawn, spawnSync } from 'node:child_process';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Verify that the packaged native binary can load representative commands,
// exit as expected, and produce output. This is not functional CLI coverage;
// command behavior is covered by the regular unit and E2E suites.
const packageRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

const binArg = process.argv[2] ?? 'dist-bin/vercel';
const binPath = isAbsolute(binArg) ? binArg : join(packageRoot, binArg);

/**
 * @typedef {object} SmokeOptions
 * @property {string} [displayName]
 * @property {string} [executable]
 * @property {string[]} [prefixArgs]
 * @property {string[]} [suffixArgs]
 * @property {NodeJS.ProcessEnv} [env]
 */

/**
 * @param {string[]} args
 * @param {SmokeOptions} [options]
 */
export function createSmokeInvocation(
  args,
  { executable = binPath, prefixArgs = [], suffixArgs = [] } = {}
) {
  return {
    executable,
    args: [...prefixArgs, ...args, ...suffixArgs],
  };
}

// Built-in commands answer `--help` with exit code 0. The sandbox CLI is
// external and owns its own help exit codes.
const SANDBOX_HELP_EXIT_CODES = [0, 2];

const COMMANDS = [
  {
    args: ['--version'],
    outputPattern: /Vercel CLI \d+\.\d+\.\d+/,
  },
  { args: ['help'] },
  { args: ['login', '--help'] },
  { args: ['logout', '--help'] },
  {
    args: ['whoami'],
    acceptedExitCodes: [1],
    outputPattern: /Logged out\./,
  },
  { args: ['deploy', '--help'] },
  { args: ['build', '--help'] },
  { args: ['dev', '--help'] },
  { args: ['env', '--help'] },
  { args: ['pull', '--help'] },
  { args: ['link', '--help'] },
  { args: ['project', 'ls', '--help'] },
  { args: ['git', '--help'] },
  { args: ['domains', '--help'] },
  { args: ['sandbox', '--help'], acceptedExitCodes: SANDBOX_HELP_EXIT_CODES },
  {
    args: ['sandbox', 'ls', '--help'],
    acceptedExitCodes: SANDBOX_HELP_EXIT_CODES,
  },
];

const FAILURE_PATTERNS = [
  /ERR_MODULE_NOT_FOUND/,
  /Cannot find package/,
  /Cannot find module/,
  /MODULE_NOT_FOUND/,
  /ERR_DLOPEN_FAILED/,
  /ERR_REQUIRE_ESM/,
  /was compiled against a different Node\.js version/,
  /Invalid or unexpected token/,
  /\bSyntaxError\b/,
  /\n\s+at node:internal\//,
];

const PER_COMMAND_TIMEOUT_MS = 30_000;

// The npm launcher adds a Node parent above the native process. Terminate the
// whole test process tree so timeouts and dev teardown do not leave it running.
export function signalProcessTree(child, signal) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}

/**
 * @param {string[]} args
 * @param {SmokeOptions} [options]
 */
function runCommand(args, options) {
  return new Promise(resolvePromise => {
    const invocation = createSmokeInvocation(args, options);
    const child = spawn(invocation.executable, invocation.args, {
      detached: process.platform !== 'win32',
      env: {
        ...(options?.env ?? process.env),
        CI: '1',
        NO_COLOR: '1',
        NO_UPDATE_NOTIFIER: '1',
        VERCEL_AUTH_TOKEN: '',
        VERCEL_CLI_DISABLE_UPDATE_NOTIFIER: '1',
        VERCEL_DIR: join(packageRoot, '.smoke-test-home'),
        VERCEL_TOKEN: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const onData = chunk => {
      output += chunk.toString();
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    const timer = setTimeout(() => {
      signalProcessTree(child, 'SIGKILL');
    }, PER_COMMAND_TIMEOUT_MS);

    child.on('error', error => {
      clearTimeout(timer);
      resolvePromise({
        output: `${output}\nspawn error: ${error.message}`,
        code: null,
        signal: 'SPAWN_ERROR',
      });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ output, code, signal });
    });
  });
}

export function evaluateCommand(command, result) {
  const label = `vc ${command.args.join(' ')}`;
  const reasons = [];
  const acceptedExitCodes = command.acceptedExitCodes ?? [0];
  const outputPattern = command.outputPattern ?? /\S/;

  for (const pattern of FAILURE_PATTERNS) {
    if (pattern.test(result.output)) {
      reasons.push(`matched ${pattern}`);
    }
  }
  if (result.signal && result.signal !== 'SPAWN_ERROR') {
    reasons.push(`killed by signal ${result.signal}`);
  }
  if (result.signal === 'SPAWN_ERROR') {
    reasons.push('failed to spawn binary');
  } else if (!result.signal && !acceptedExitCodes.includes(result.code)) {
    reasons.push(
      `exited with code ${result.code} (expected ${acceptedExitCodes.join(
        ' or '
      )})`
    );
  }
  if (!outputPattern.test(result.output)) {
    reasons.push(`output did not match ${outputPattern}`);
  }

  return { label, ok: reasons.length === 0, reasons };
}

/** @param {SmokeOptions} [options] */
export async function smokeTestBinary(options = {}) {
  const displayName = options.displayName ?? options.executable ?? binPath;
  console.log(`Smoke testing binary: ${displayName}\n`);

  const failures = [];
  for (const command of COMMANDS) {
    const result = await runCommand(command.args, options);
    const verdict = evaluateCommand(command, result);

    if (verdict.ok) {
      console.log(`  PASS  ${verdict.label}`);
    } else {
      console.log(`  FAIL  ${verdict.label}  (${verdict.reasons.join('; ')})`);
      const snippet = result.output.trim().split('\n').slice(0, 12).join('\n');
      console.log(
        snippet
          .split('\n')
          .map(line => `        | ${line}`)
          .join('\n')
      );
      failures.push(verdict);
    }
  }

  console.log('');
  if (failures.length > 0) {
    console.error(
      `Smoke test FAILED: ${failures.length}/${COMMANDS.length} command(s) failed validation:`
    );
    for (const failure of failures) {
      console.error(`  - ${failure.label}: ${failure.reasons.join('; ')}`);
    }
    return false;
  }

  console.log(
    `Smoke test PASSED: all ${COMMANDS.length} commands completed successfully.`
  );
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  smokeTestBinary().then(
    ok => {
      if (!ok) process.exit(1);
    },
    error => {
      console.error('Smoke test harness crashed:', error);
      process.exit(1);
    }
  );
}
