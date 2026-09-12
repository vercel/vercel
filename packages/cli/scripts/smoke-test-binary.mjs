import { spawn } from 'node:child_process';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Verify that the packaged native binary can load representative commands,
// exit as expected, and produce output. This is not functional CLI coverage;
// command behavior is covered by the regular unit and E2E suites.
const packageRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

const binArg = process.argv[2] ?? 'dist-bin/vercel';
const binPath = isAbsolute(binArg) ? binArg : join(packageRoot, binArg);

// `--help` exits 0 in some command families and 2 (usage) in others. Both are
// established CLI behavior; the smoke test only cares that the command loaded
// and printed help, so accept either.
const HELP_EXIT_CODES = [0, 2];

const COMMANDS = [
  {
    args: ['--version'],
    outputPattern: /Vercel CLI \d+\.\d+\.\d+/,
  },
  { args: ['help'] },
  { args: ['login', '--help'], acceptedExitCodes: HELP_EXIT_CODES },
  { args: ['logout', '--help'], acceptedExitCodes: HELP_EXIT_CODES },
  {
    args: ['whoami'],
    acceptedExitCodes: [1],
    outputPattern: /Logged out\./,
  },
  { args: ['deploy', '--help'], acceptedExitCodes: HELP_EXIT_CODES },
  { args: ['build', '--help'], acceptedExitCodes: HELP_EXIT_CODES },
  { args: ['dev', '--help'], acceptedExitCodes: HELP_EXIT_CODES },
  { args: ['env', '--help'], acceptedExitCodes: HELP_EXIT_CODES },
  { args: ['pull', '--help'], acceptedExitCodes: HELP_EXIT_CODES },
  { args: ['link', '--help'], acceptedExitCodes: HELP_EXIT_CODES },
  { args: ['project', 'ls', '--help'], acceptedExitCodes: HELP_EXIT_CODES },
  { args: ['git', '--help'], acceptedExitCodes: HELP_EXIT_CODES },
  { args: ['domains', '--help'], acceptedExitCodes: HELP_EXIT_CODES },
  { args: ['sandbox', '--help'], acceptedExitCodes: HELP_EXIT_CODES },
  { args: ['sandbox', 'ls', '--help'], acceptedExitCodes: HELP_EXIT_CODES },
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

function runCommand(args) {
  return new Promise(resolvePromise => {
    const child = spawn(binPath, args, {
      env: {
        ...process.env,
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
      child.kill('SIGKILL');
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

async function main() {
  console.log(`Smoke testing binary: ${binPath}\n`);

  const failures = [];
  for (const command of COMMANDS) {
    const result = await runCommand(command.args);
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
    process.exit(1);
  }

  console.log(
    `Smoke test PASSED: all ${COMMANDS.length} commands completed successfully.`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('Smoke test harness crashed:', error);
    process.exit(1);
  });
}
