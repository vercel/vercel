import { NowBuildError } from '@vercel/build-utils';
import { prepareFlagsDefinitions } from '@vercel/prepare-flags-definitions';
import nodeFetch from 'node-fetch';
import output from '../../output-manager';
import pkg from '../../util/pkg';

/**
 * Emits flag definitions into node_modules/@vercel/flags-definitions
 *
 * Thin wrapper around @vercel/prepare-flags-definitions that adapts
 * the CLI's output, fetch, and error conventions.
 */
export async function emitFlagsDatafiles(
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<void> {
  try {
    await prepareFlagsDefinitions({
      cwd,
      env,
      version: pkg.version,
      fetch: nodeFetch as unknown as typeof globalThis.fetch,
      output: {
        debug: (msg: string) => output.debug(msg),
        time: <T>(label: string, promise: Promise<T>) =>
          output.time(label, promise),
      },
    });
  } catch (err) {
    throw new NowBuildError({
      code: 'VERCEL_FLAGS_DEFINITIONS_FETCH_FAILED',
      message: err instanceof Error ? err.message : String(err),
      link: 'https://vercel.com/docs/flags',
    });
  }
}
