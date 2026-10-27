import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Hand the packaged native binary a `vercel build` the way the build container
// does: start it as an internal build worker, wait for `ready`, send the build
// request over its socket, and check that the build ran on the direct path
// (not the full CLI fallback) and produced its output. Unit tests cover the
// same handoff with dist/vc.js on Node; this covers it inside the binary.
const packageRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const binArg = process.argv[2] ?? 'dist-bin/vercel';
const binPath = isAbsolute(binArg) ? binArg : join(packageRoot, binArg);

const TIMEOUT_MS = 180_000;

function fail(message, stderr) {
  console.error(`Build worker smoke test FAILED: ${message}`);
  if (stderr) {
    console.error(
      stderr
        .trim()
        .split('\n')
        .slice(-40)
        .map(line => `  | ${line}`)
        .join('\n')
    );
  }
  process.exit(1);
}

async function main() {
  if (process.platform === 'win32') {
    console.log('Build worker smoke test skipped: Unix sockets only.');
    return;
  }
  console.log(`Build worker smoke testing binary: ${binPath}\n`);

  // Unix socket paths are limited to 104 bytes on macOS.
  const root = await mkdtemp('/tmp/vc-worker-smoke-');
  try {
    const projectDir = join(root, 'project');
    const outputDir = join(root, 'out');
    const socketPath = join(root, 'worker.sock');
    const readyFile = join(root, 'ready');
    await mkdir(join(projectDir, 'public'), { recursive: true });
    await mkdir(join(projectDir, '.vercel'));
    await writeFile(join(projectDir, 'public', 'index.html'), '<h1>hi</h1>');
    await writeFile(
      join(projectDir, '.vercel', 'project.json'),
      JSON.stringify({
        projectId: 'prj_smoke',
        orgId: 'team_smoke',
        settings: { framework: null, outputDirectory: 'public' },
      })
    );

    const child = spawn(
      binPath,
      [
        '--internal-build-worker',
        '--socket',
        socketPath,
        '--ready-file',
        readyFile,
      ],
      {
        cwd: root,
        env: {
          HOME: root,
          PATH: process.env.PATH ?? '',
          NO_UPDATE_NOTIFIER: '1',
          VERCEL_TELEMETRY_DISABLED: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let stderr = '';
    child.stdout.on('data', chunk => {
      stderr += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    const exited = new Promise(resolveExit =>
      child.once('exit', code => resolveExit(code))
    );
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      fail(`timed out after ${TIMEOUT_MS / 1000}s`, stderr);
    }, TIMEOUT_MS);

    const messages = [];
    await new Promise((resolveDone, reject) => {
      const connect = () => {
        const socket = createConnection(socketPath);
        // A failed attempt emits `close` after `error`; only the socket that
        // connected ends the handoff.
        let connected = false;
        socket.once('connect', () => {
          connected = true;
        });
        let received = '';
        socket.setEncoding('utf8');
        socket.on('data', chunk => {
          received += chunk;
          let newline = received.indexOf('\n');
          while (newline !== -1) {
            const message = JSON.parse(received.slice(0, newline));
            received = received.slice(newline + 1);
            newline = received.indexOf('\n');
            messages.push(message);
            if (message.type === 'ready') {
              socket.write(
                `${JSON.stringify({
                  type: 'build',
                  id: 'smoke',
                  cwd: projectDir,
                  argv: ['build', '--output', outputDir],
                  env: {
                    HOME: root,
                    PATH: process.env.PATH ?? '',
                    NO_UPDATE_NOTIFIER: '1',
                    VERCEL_TELEMETRY_DISABLED: '1',
                  },
                })}\n`
              );
            }
          }
        });
        socket.once('close', () => {
          if (connected) resolveDone();
        });
        socket.once('error', error => {
          socket.destroy();
          if (
            messages.length === 0 &&
            (error.code === 'ENOENT' || error.code === 'ECONNREFUSED') &&
            child.exitCode === null
          ) {
            setTimeout(connect, 25);
          } else {
            reject(error);
          }
        });
      };
      connect();
    }).catch(error => fail(`socket error: ${error.message}`, stderr));

    const exitCode = await exited;
    clearTimeout(timer);

    const [ready] = messages;
    const terminal = messages.at(-1);
    if (ready?.type !== 'ready' || ready.protocol !== 1) {
      fail(
        `expected a protocol 1 ready message, got ${JSON.stringify(ready)}`,
        stderr
      );
    }
    if (terminal?.type !== 'complete' || terminal.exitCode !== 0) {
      fail(
        `expected a successful completion, got ${JSON.stringify(terminal)}`,
        stderr
      );
    }
    if (exitCode !== 0) fail(`worker exited with code ${exitCode}`, stderr);
    if (!existsSync(readyFile))
      fail('the worker did not write its ready file', stderr);

    const traces = JSON.parse(
      await readFile(join(outputDir, 'diagnostics', 'cli_traces.json'), 'utf8')
    );
    const cliSpan = traces.find(event => event.name === 'vc.cli');
    if (cliSpan?.tags?.directBuild !== 'true') {
      fail(
        `the build did not run on the direct path: ${JSON.stringify(cliSpan?.tags)}`,
        stderr
      );
    }
    const html = await readFile(
      join(outputDir, 'static', 'index.html'),
      'utf8'
    ).catch(() => undefined);
    if (html !== '<h1>hi</h1>') fail('the build output is missing', stderr);

    const { readyAt, terminalAt } = terminal.timings ?? {};
    console.log(
      `Build worker smoke test PASSED: ready at ${readyAt}ms, build completed at ${terminalAt}ms on the direct path.`
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

main().catch(error => fail(`harness crashed: ${error?.stack ?? error}`));
