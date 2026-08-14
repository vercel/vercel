import { spawn } from 'node:child_process';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

const binArg = process.argv[2] ?? 'dist-bin/vercel';
const binPath = isAbsolute(binArg) ? binArg : join(packageRoot, binArg);

const COMMANDS = [
  ['--version'],
  ['help'],
  ['login', '--help'],
  ['logout', '--help'],
  ['whoami'],
  ['deploy', '--help'],
  ['build', '--help'],
  ['dev', '--help'],
  ['env', '--help'],
  ['pull', '--help'],
  ['link', '--help'],
  ['project', 'ls', '--help'],
  ['git', '--help'],
  ['domains', '--help'],
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
        VERCEL_CLI_DISABLE_UPDATE_NOTIFIER: '1',
        VERCEL_DIR: join(packageRoot, '.smoke-test-home'),
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

function evaluate(args, result) {
  const label = `vc ${args.join(' ')}`;
  const reasons = [];

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
  }

  return { label, ok: reasons.length === 0, reasons };
}

async function main() {
  console.log(`Smoke testing binary: ${binPath}\n`);

  const failures = [];
  for (const args of COMMANDS) {
    const result = await runCommand(args);
    const verdict = evaluate(args, result);

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
      `Smoke test FAILED: ${failures.length}/${COMMANDS.length} command(s) produced a fatal error:`
    );
    for (const failure of failures) {
      console.error(`  - ${failure.label}: ${failure.reasons.join('; ')}`);
    }
    process.exit(1);
  }

  console.log(
    `Smoke test PASSED: all ${COMMANDS.length} commands ran without fatal errors.`
  );
}

main().catch(error => {
  console.error('Smoke test harness crashed:', error);
  process.exit(1);
});
