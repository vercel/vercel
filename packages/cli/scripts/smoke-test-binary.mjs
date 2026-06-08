import { spawn } from 'node:child_process';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Smoke test the built CLI binary by actually *running* it.
//
// `--version` alone is not a sufficient release gate: it never loads the
// config/auth code path, so a binary that is missing a bundled package (e.g.
// `@vercel/cli-auth`) passes `--version` and still crashes on `login`/`whoami`.
// This script runs a battery of representative commands and fails the release
// if any of them surface a module-resolution / native-load failure or crash.
//
// Usage: node scripts/smoke-test-binary.mjs [path-to-binary]
//        (defaults to ./dist-bin/vercel)

const packageRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

const binArg = process.argv[2] ?? 'dist-bin/vercel';
const binPath = isAbsolute(binArg) ? binArg : join(packageRoot, binArg);

// Commands exercising the major code paths without needing network or
// credentials. `--help` variants load the command module (and its imports,
// including config/auth) without performing real work; `whoami` exercises the
// auth-read path directly. Extend this list as new heavy command paths land.
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

// Output that indicates a broken binary, regardless of exit code. These are
// failures we must never release: missing bundled modules, un-loadable native
// addons, syntax/parse errors, or a raw Node internal stack trace.
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

// A command being logged-out (whoami/login) legitimately exits non-zero; that
// is NOT a smoke failure. Only the patterns above (or a crash signal) are.
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
        // Avoid touching/writing the user's real auth during the read path.
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
  // A crash by signal (segfault/abort) or a forced kill (timeout/hang).
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
    console.error(
      '\nThis binary must not be released. A common cause is an imported package ' +
        'that was not bundled into the binary (see binaryRuntimePackageNames in ' +
        'scripts/build-binary.mjs).'
    );
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
