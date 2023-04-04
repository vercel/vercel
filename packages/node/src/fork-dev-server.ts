import once from '@tootallnate/once';
import { cloneEnv, Config, Meta } from '@vercel/build-utils';
import { ChildProcess, fork, ForkOptions } from 'child_process';
import { join } from 'path';

export function forkDevServer(options: {
  config: Config;
  workPath: string | undefined;
  isEsm: boolean;
  require_: NodeRequire;
  entrypoint: string;
  meta: Meta;

  /**
   * A path to the dev-server path. This is used in tests.
   */
  devServerPath?: string;
}) {
  const devServerPath =
    options.devServerPath || join(__dirname, 'dev-server.js');

  const forkOptions: ForkOptions = {
    cwd: options.workPath,
    execArgv: [],
    env: cloneEnv(process.env, options.meta.env, {
      VERCEL_DEV_ENTRYPOINT: options.entrypoint,
      VERCEL_DEV_IS_ESM: options.isEsm ? '1' : undefined,
      VERCEL_DEV_CONFIG: JSON.stringify(options.config),
      VERCEL_DEV_BUILD_ENV: JSON.stringify(options.meta.buildEnv || {}),
      NODE_OPTIONS: process.env.NODE_OPTIONS,
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
  | { state: 'message'; value: { port: number } }
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
