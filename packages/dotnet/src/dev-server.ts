import { spawn } from 'child_process';
import { dirname, join } from 'path';
import {
  StartDevServerOptions,
  StartDevServerResult,
  debug,
  cloneEnv,
} from '@vercel/build-utils';
import { findCsprojFile } from './project';

/**
 * Start a dev server for .NET projects.
 *
 * Spawns `dotnet run` on a random port and returns { port, pid }
 * for the CLI's DevServerOrchestrator to proxy to.
 */
export async function startDotnetDevServer(
  options: StartDevServerOptions
): Promise<StartDevServerResult> {
  const { workPath, entrypoint, meta = {} } = options;

  const port = Math.floor(Math.random() * (65535 - 49152) + 49152);
  const csprojPath = await findCsprojFile(workPath, entrypoint);
  const csprojDir = dirname(join(workPath, csprojPath));

  const env = cloneEnv(process.env, meta.env, {
    ASPNETCORE_URLS: `http://localhost:${port}`,
  });
  debug(`Starting .NET dev server on port ${port} using local dotnet`);

  const child = spawn('dotnet', ['run'], {
    cwd: csprojDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', data => {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (options.onStdout) {
      options.onStdout(chunk);
    } else {
      process.stdout.write(chunk.toString());
    }
  });

  child.stderr?.on('data', data => {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (options.onStderr) {
      options.onStderr(chunk);
    } else {
      process.stderr.write(chunk.toString());
    }
  });

  // Give dotnet a startup window and fail fast if it exits early
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, 5000);

    const onExit = (code: number | null, signal: string | null) => {
      cleanup();
      reject(
        new Error(
          `.NET dev server exited before startup completed (code: ${code}, signal: ${signal})`
        )
      );
    };

    const cleanup = () => {
      clearTimeout(timeout);
      child.removeListener('exit', onExit);
    };

    child.once('exit', onExit);
  });

  return {
    port,
    pid: child.pid!,
  };
}
