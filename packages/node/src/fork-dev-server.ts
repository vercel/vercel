import once from '@tootallnate/once';
import { cloneEnv } from '@vercel/build-utils';
import type { Config, Meta } from '@vercel/build-utils';
import {
  ChildProcess,
  fork,
  ForkOptions,
  spawn,
  SpawnOptions,
} from 'child_process';
import { pathToFileURL } from 'url';
import { join } from 'path';
import { getOrCreateBunBinary } from './bun-helpers';

export async function forkDevServer(options: {
  tsConfig: any;
  config: Config;
  maybeTranspile: boolean;
  workPath: string | undefined;
  isTypeScript: boolean;
  isEsm: boolean;
  require_: NodeRequire;
  entrypoint: string;
  meta: Meta;
  printLogs?: boolean;
  publicDir?: string;
  runtime?: 'node' | 'bun';

  /**
   * A path to the dev-server path. This is used in tests.
   */
  devServerPath?: string;
}): Promise<ChildProcess> {
  const devServerPath =
    options.devServerPath || join(__dirname, 'dev-server.mjs');

  let child: ChildProcess;

  if (options.runtime === 'bun') {
    const bun = await getOrCreateBunBinary();
    const spawnOptions: SpawnOptions = {
      cwd: options.workPath,
      env: cloneEnv(process.env, options.meta.env, {
        VERCEL_DEV_ENTRYPOINT: options.entrypoint,
        VERCEL_DEV_CONFIG: JSON.stringify(options.config),
        VERCEL_DEV_BUILD_ENV: JSON.stringify(options.meta.buildEnv || {}),
        VERCEL_DEV_PUBLIC_DIR: options.publicDir || '',
      }),
      stdio: ['pipe', 'pipe', 'pipe'],
    };

    child = spawn(bun, ['--bun', devServerPath], spawnOptions);

    // Parse stdout to get the port to send requests to, since we can't use IPC with Bun. We
    // buffer the output until we find the port, then emit it back as a message
    let buffer = '';

    child.stdout?.on('data', data => {
      const output = data.toString();
      buffer += output;

      if (buffer.includes('Dev server listening:')) {
        const portMatch = buffer.match(/(\d{4,5})/);
        if (portMatch) {
          const port = parseInt(portMatch[1], 10);
          child.emit('message', { port }, null);
        }
        buffer = '';
      } else {
        // Still log other stdout data
        console.log(output);
      }
    });
    child.stderr?.on('data', console.error);
  } else {
    let nodeOptions = process.env.NODE_OPTIONS || '';

    if (!nodeOptions.includes('--no-warnings')) {
      nodeOptions += ' --no-warnings';
    }

    const tsNodePath = options.require_.resolve('ts-node');
    const esmLoader = pathToFileURL(join(tsNodePath, '..', '..', 'esm.mjs'));
    const cjsLoader = join(tsNodePath, '..', '..', 'register', 'index.js');

    if (options.maybeTranspile) {
      if (options.isTypeScript) {
        nodeOptions = `--require ${cjsLoader} --loader ${esmLoader} ${
          nodeOptions || ''
        }`;
      } else {
        if (options.isEsm) {
          // no transform needed because Node.js supports ESM natively
        } else {
          nodeOptions = `--require ${cjsLoader} ${nodeOptions || ''}`;
        }
      }
    }

    const forkOptions: ForkOptions = {
      cwd: options.workPath,
      execArgv: [],
      env: cloneEnv(process.env, options.meta.env, {
        VERCEL_DEV_ENTRYPOINT: options.entrypoint,
        VERCEL_DEV_CONFIG: JSON.stringify(options.config),
        VERCEL_DEV_BUILD_ENV: JSON.stringify(options.meta.buildEnv || {}),
        VERCEL_DEV_PUBLIC_DIR: options.publicDir || '',
        TS_NODE_TRANSPILE_ONLY: '1',
        TS_NODE_COMPILER_OPTIONS: options.tsConfig?.compilerOptions
          ? JSON.stringify(options.tsConfig.compilerOptions)
          : undefined,
        NODE_OPTIONS: nodeOptions,
      }),
      stdio: options.printLogs ? 'pipe' : undefined,
    };
    child = fork(devServerPath, [], forkOptions);
  }

  if (options.printLogs) {
    child.stdout?.on('data', data => {
      console.log(`stdout: ${data}`);
    });
    child.stderr?.on('data', data => {
      console.error(`stderr: ${data}`);
    });
  }

  checkForPid(devServerPath, child);

  return child;
}

function checkForPid(
  path: string,
  process: ChildProcess
): asserts process is ChildProcess & { pid: number } {
  if (!process.pid) {
    throw new Error(`Child Process has no "pid" when forking: "${path}"`);
  }
}

/**
 * When launching a dev-server, we want to know its state.
 * This function will be used to know whether it was exited (due to some error),
 * or it is listening to new requests, and we can start proxying requests.
 */
export async function readMessage(
  child: ChildProcess
): Promise<
  | { state: 'message'; value: { address?: string; port: number } }
  | { state: 'exit'; value: [number, string | null] }
> {
  const onMessage = once<{ port: number }>(child, 'message');
  const onExit = once.spread<[number, string | null]>(child, 'close');
  const result = await Promise.race([
    onMessage.then(x => {
      return { state: 'message' as const, value: x };
    }),
    onExit.then(v => {
      return { state: 'exit' as const, value: v };
    }),
  ]);
  onExit.cancel();
  onMessage.cancel();

  return result;
}
