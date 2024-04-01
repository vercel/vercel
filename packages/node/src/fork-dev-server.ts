import once from '@tootallnate/once';
import { cloneEnv } from '@vercel/build-utils';
import type { Config, Meta } from '@vercel/build-utils';
import { ChildProcess, fork, ForkOptions } from 'child_process';
import { pathToFileURL } from 'url';
import { join } from 'path';

export function forkDevServer(options: {
  tsConfig: any;
  config: Config;
  maybeTranspile: boolean;
  workPath: string | undefined;
  isTypeScript: boolean;
  isEsm: boolean;
  require_: NodeRequire;
  entrypoint: string;
  meta: Meta;

  /**
   * A path to the dev-server path. This is used in tests.
   */
  devServerPath?: string;
}) {
  let nodeOptions = process.env.NODE_OPTIONS || '';

  if (!nodeOptions.includes('--no-warnings')) {
    nodeOptions += ' --no-warnings';
  }
  const tsNodePath = options.require_.resolve('ts-node');
  const esmLoader = pathToFileURL(options.require_.resolve('tsx'));
  const cjsLoader = join(tsNodePath, '..', '..', 'register', 'index.js');
  const devServerPath =
    options.devServerPath || join(__dirname, 'dev-server.mjs');

  if (options.maybeTranspile) {
    if (options.isTypeScript) {
      nodeOptions = `--import ${esmLoader} ${nodeOptions || ''}`;
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
      TS_NODE_TRANSPILE_ONLY: '1',
      TS_NODE_COMPILER_OPTIONS: options.tsConfig?.compilerOptions
        ? JSON.stringify(options.tsConfig.compilerOptions)
        : undefined,
      NODE_OPTIONS: nodeOptions,
    }),
  };

  const child = fork(devServerPath, [], forkOptions);

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
