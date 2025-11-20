import { spawn } from 'child_process';
import { once } from 'events';
import type { StartDevServer } from '@vercel/build-utils';
import { debug } from '@vercel/build-utils';
import { installRustToolchain } from './rust-toolchain';
import { buildExecutableForDev } from './dev-build';
import { createDevServerEnv } from './dev-server';

export const startDevServer: StartDevServer = async opts => {
  const { entrypoint, workPath, meta = {} } = opts;
  try {
    await installRustToolchain();
    const executablePath = await buildExecutableForDev(workPath, entrypoint);

    debug(`Starting Rust dev server: ${executablePath}`);
    const devEnv = createDevServerEnv(process.env, meta);
    // Start the executable as a dev server using spawn
    const child = spawn(executablePath, [], {
      cwd: workPath,
      env: devEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!child.pid) {
      throw new Error('Failed to start dev server process');
    }

    debug(`Dev server process started with PID: ${child.pid}`);

    // Parse stdout to get the port
    let buffer = '';
    let portEmitted = false;

    child.stdout?.on('data', data => {
      const output = data.toString();
      buffer += output;
      // Look for server ready patterns (emitted in `lib.rs`)
      if (!portEmitted && buffer.includes('Dev server listening:')) {
        const portMatch = buffer.match(/Dev server listening: (\d+)/);
        if (portMatch) {
          const port = parseInt(portMatch[1], 10);
          debug(
            `Rust dev server detected port ${port}, emitting message event`
          );

          child.emit('message', { port }, null);
          portEmitted = true;
        }
        buffer = ''; // Clear buffer only after successful extraction
      }
      console.log(output);
    });

    child.stderr?.on('data', data => {
      console.error(data.toString());
    });

    child.on('error', err => {
      debug(`Dev server error: ${err}`);
    });

    child.on('exit', (code, signal) => {
      debug(`Dev server exited with code ${code}, signal ${signal}`);
    });

    const onMessage = once(child, 'message');
    const onExit = once(child, 'close');

    const result = await Promise.race([
      onMessage.then((args: any[]) => {
        const [messageData] = args;
        return { state: 'message' as const, value: messageData };
      }),
      onExit.then((args: any[]) => {
        const [code, signal] = args;
        return { state: 'exit' as const, value: [code, signal] };
      }),
    ]);

    if (result.state === 'message') {
      const { port } = result.value;
      debug(`Rust dev server ready on port ${port}`);

      if (!child.pid) {
        throw new Error('Child process has no PID');
      }

      const shutdown = async () => {
        try {
          process.kill(child.pid!, 'SIGTERM');
        } catch (err) {
          debug(`Error terminating Rust dev server: ${err}`);
        }
      };

      return { port, pid: child.pid, shutdown };
    } else {
      // Process exited
      const [exitCode, signal] = result.value;
      const reason = signal ? `"${signal}" signal` : `exit code ${exitCode}`;
      throw new Error(`Rust dev server failed with ${reason}`);
    }
  } catch (error) {
    debug(`Failed to start dev server: ${error}`);
    // Return null to indicate dev server couldn't be started
    // This will cause vercel dev to fall back to build-and-invoke mode
    return null;
  }
};
