import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, '..', '..', '..', 'dist');
const vcPath = join(distDir, 'vc.js');

const resolveHooks = `
  import { appendFileSync } from 'node:fs';
  export async function resolve(specifier, context, next) {
    const result = await next(specifier, context);
    appendFileSync(process.env.TRACE_MODULES_FILE, result.url + '\\n');
    return result;
  }
`;
const registerHooks = `
  import { register } from 'node:module';
  register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(resolveHooks)}`)});
`;

let root: string;

// The worker socket lives in this directory. macOS limits Unix socket paths
// to 104 bytes, which the realpath of os.tmpdir() alone nearly exhausts.
const tempBase = process.platform === 'win32' ? tmpdir() : '/tmp';

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tempBase, 'vc-ibw-')));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

async function runWorkerBuild(argv: string[]) {
  const projectDir = join(root, 'project');
  await mkdir(join(projectDir, 'public'), { recursive: true });
  await mkdir(join(projectDir, '.vercel'));
  await writeFile(join(projectDir, 'public', 'index.html'), '<h1>hi</h1>');
  await writeFile(
    join(projectDir, '.vercel', 'project.json'),
    JSON.stringify({
      projectId: 'prj_test',
      orgId: 'team_test',
      settings: { framework: null, outputDirectory: 'public' },
    })
  );

  const socketPath = join(root, 'worker.sock');
  const modulesFile = join(root, 'modules.txt');
  await writeFile(modulesFile, '');
  const child = spawn(
    process.execPath,
    [
      '--import',
      `data:text/javascript,${encodeURIComponent(registerHooks)}`,
      vcPath,
      '--internal-build-worker',
      '--socket',
      socketPath,
    ],
    {
      env: { ...process.env, TRACE_MODULES_FILE: modulesFile },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let stderr = '';
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });
  const exited = new Promise<number | null>(resolve =>
    child.once('exit', code => resolve(code))
  );

  const messages: Array<Record<string, unknown>> = [];
  await new Promise<void>((resolve, reject) => {
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
                id: 'build-1',
                cwd: projectDir,
                argv,
                env: {
                  HOME: root,
                  NO_UPDATE_NOTIFIER: '1',
                  PATH: process.env.PATH ?? '',
                  VERCEL_TELEMETRY_DISABLED: '1',
                },
              })}\n`
            );
          }
        }
      });
      socket.once('close', () => {
        if (connected) resolve();
      });
      socket.once('error', (error: NodeJS.ErrnoException) => {
        socket.destroy();
        if (
          messages.length === 0 &&
          (error.code === 'ENOENT' || error.code === 'ECONNREFUSED')
        ) {
          setTimeout(connect, 10);
        } else {
          reject(error);
        }
      });
    };
    connect();
  });

  const exitCode = await exited;
  const modules = (await readFile(modulesFile, 'utf8')).split('\n');
  return { exitCode, messages, modules, projectDir, stderr };
}

async function readSpanTags(outputDir: string, name = 'vc.cli') {
  const events = JSON.parse(
    await readFile(join(outputDir, 'diagnostics', 'cli_traces.json'), 'utf8')
  ) as Array<{ name: string; tags: Record<string, string> }>;
  return events.find(event => event.name === name)?.tags;
}

describe.skipIf(process.platform === 'win32')(
  'dist/vc.js --internal-build-worker',
  () => {
    const indexUrl = pathToFileURL(join(distDir, 'index.js')).href;

    it('runs `vercel build` without loading the CLI router', async () => {
      const outputDir = join(root, 'out');
      const result = await runWorkerBuild(['build', '--output', outputDir]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.messages.at(-1)).toEqual({
        type: 'complete',
        exitCode: 0,
        timings: expect.objectContaining({
          handoffReceivedAt: expect.any(Number),
          terminalAt: expect.any(Number),
        }),
      });
      expect(result.messages[0]).toEqual(
        expect.objectContaining({
          type: 'ready',
          timings: expect.objectContaining({
            entryAt: expect.any(Number),
            listenAt: expect.any(Number),
            buildModuleLoadedAt: expect.any(Number),
            readyAt: expect.any(Number),
            vltPreloadStartedAt: expect.any(Number),
            node: process.versions.node,
          }),
        })
      );
      expect(result.modules).not.toContain(indexUrl);
      expect(result.stderr).toContain('Build Completed');
      expect(await readSpanTags(outputDir)).toMatchObject({
        directBuild: 'true',
      });
      await expect(
        readFile(join(outputDir, 'static', 'index.html'), 'utf8')
      ).resolves.toBe('<h1>hi</h1>');
    });

    it('falls back to the full CLI for unsupported global flags', async () => {
      const outputDir = join(root, 'out');
      const result = await runWorkerBuild([
        'build',
        '--output',
        outputDir,
        '--api',
        'https://api.vercel.com',
      ]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.messages.at(-1)).toEqual(
        expect.objectContaining({ type: 'complete', exitCode: 0 })
      );
      expect(result.modules).toContain(indexUrl);
      expect(await readSpanTags(outputDir)).toMatchObject({
        directBuild: 'false',
        fallbackReason: 'flag:--api',
      });
      await expect(
        readFile(join(outputDir, 'static', 'index.html'), 'utf8')
      ).resolves.toBe('<h1>hi</h1>');
    });
  }
);
