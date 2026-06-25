import { startDevServer } from '../src/start-dev-server';
import path from 'path';
import fs from 'fs-extra';
import execa from 'execa';
import WebSocket from 'ws';

vi.setConfig({ testTimeout: 120 * 1000, hookTimeout: 120 * 1000 });

const fixturesPath = path.resolve(__dirname, 'fixtures');
const fixturePath = path.join(fixturesPath, '66-flask-websocket');

/**
 * Find a Python interpreter that satisfies vercel-runtime's `requires-python`
 * (>= 3.12). The bare `python3` on a developer machine may be older, which
 * would make the injected vercel-runtime install fail.
 */
async function findPython(): Promise<string> {
  const candidates = ['python3.12', 'python3.13', 'python3.14', 'python3'];
  for (const candidate of candidates) {
    try {
      const { stdout } = await execa(candidate, [
        '-c',
        'import sys; print("%d.%d" % sys.version_info[:2])',
      ]);
      const [major, minor] = stdout.trim().split('.').map(Number);
      if (major === 3 && minor >= 12) {
        return candidate;
      }
    } catch {
      // try the next candidate
    }
  }
  throw new Error('no Python >= 3.12 interpreter found on PATH');
}

async function withDevServer(
  workPath: string,
  fn: (url: string) => Promise<void>
) {
  const entrypoint = 'api/index.py';
  const config = { framework: 'flask' as const };

  // Create virtual environment and install dependencies if requirements.txt
  // exists, mirroring middleware.test.ts.
  const requirementsPath = path.join(workPath, 'requirements.txt');
  if (await fs.pathExists(requirementsPath)) {
    try {
      const python = await findPython();
      await execa(python, ['-m', 'venv', '.venv'], {
        cwd: workPath,
        stdio: 'inherit',
      });

      const venvPython =
        process.platform === 'win32'
          ? path.join(workPath, '.venv', 'Scripts', 'python.exe')
          : path.join(workPath, '.venv', 'bin', 'python');

      await execa(
        venvPython,
        ['-m', 'pip', 'install', '-r', 'requirements.txt'],
        {
          cwd: workPath,
          stdio: 'inherit',
        }
      );
    } catch (err) {
      console.warn('Failed to create venv or install dependencies:', err);
      // Continue anyway - maybe dependencies are already installed
    }
  }

  const result = await startDevServer({
    entrypoint,
    workPath,
    config,
    meta: { isDev: true },
    files: {},
    repoRootPath: workPath,
  });

  if (!result) {
    throw new Error('Failed to start dev server');
  }

  const { port, shutdown } = result;
  const url = `http://127.0.0.1:${port}`;

  // Wait a bit for server to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    await fn(url);
  } finally {
    if (shutdown) {
      await shutdown();
    }
  }
}

/**
 * Open a WebSocket, send each message in order (one at a time, waiting for the
 * reply), then close. Resolves with the list of received messages.
 */
function wsEcho(wsUrl: string, messages: string[]): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const received: string[] = [];
    let index = 0;

    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('WebSocket timed out'));
    }, 15 * 1000);

    socket.on('open', () => {
      socket.send(messages[index]);
    });
    socket.on('message', data => {
      received.push(data.toString());
      index += 1;
      if (index < messages.length) {
        socket.send(messages[index]);
      } else {
        socket.close();
      }
    });
    socket.on('close', () => {
      clearTimeout(timer);
      resolve(received);
    });
    socket.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe('Flask WebSocket (flask-sock) dev server', () => {
  it('completes the handshake and echoes messages', async () => {
    await withDevServer(fixturePath, async url => {
      const wsUrl = `${url.replace(/^http/, 'ws')}/ws`;
      const received = await wsEcho(wsUrl, ['hello', 'world']);
      expect(received).toEqual(['echo:hello', 'echo:world']);
    });
  });

  it('serves regular HTTP routes alongside the WebSocket route', async () => {
    await withDevServer(fixturePath, async url => {
      const httpResponse = await fetch(`${url}/`);
      expect(httpResponse.status).toBe(200);
      expect(await httpResponse.text()).toContain('flask-websocket ok');

      const wsUrl = `${url.replace(/^http/, 'ws')}/ws`;
      const received = await wsEcho(wsUrl, ['ping']);
      expect(received).toEqual(['echo:ping']);
    });
  });
});
