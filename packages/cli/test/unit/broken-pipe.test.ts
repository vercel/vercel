import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const cliPath = fileURLToPath(new URL('../../dist/vc.js', import.meta.url));

it('exits cleanly when the stderr pipe closes', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'vercel-stderr-epipe-'));
  const child = spawn(process.execPath, [cliPath, 'help'], {
    cwd,
    env: {
      ...process.env,
      NO_UPDATE_NOTIFIER: '1',
      VERCEL_CLI_USE_NATIVE_BINARY: '0',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const exitPromise = once(child, 'exit');
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, 5_000);

  child.stderr.destroy();

  try {
    const [code, signal] = await exitPromise;

    expect({ code, signal, timedOut }).toEqual({
      code: 0,
      signal: null,
      timedOut: false,
    });
  } finally {
    clearTimeout(timeout);
    child.kill('SIGKILL');
    await rm(cwd, { recursive: true, force: true });
  }
});
