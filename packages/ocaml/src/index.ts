/**
 * @vercel/ocaml - Vercel OCaml Runtime
 *
 * This runtime provides zero-config deployment for OCaml HTTP servers.
 * Projects with a `dune-project` file are automatically detected and built.
 *
 * Supported frameworks:
 * - Dream
 * - Cohttp
 * - Opium
 * - Any HTTP server listening on $PORT
 *
 * Build flow:
 * 1. Download/setup opam (cached)
 * 2. Create/restore OCaml compiler switch (cached)
 * 3. Install dependencies via opam
 * 4. Build with dune
 * 5. Package as executable Lambda with IPC bootstrap
 */

import {
  BuildOptions,
  Files,
  PrepareCacheOptions,
  StartDevServerOptions,
  StartDevServerResult,
  glob,
  shouldServe,
  debug,
} from '@vercel/build-utils';

import {
  detectOcamlEntrypoint,
  OCAML_CANDIDATE_ENTRYPOINTS,
} from './entrypoint';
import {
  buildStandaloneServer,
  startStandaloneDevServer,
} from './standalone-server';
import { localCacheDir } from './ocaml-helpers';

export { shouldServe };
export const version = 3;

/**
 * Build an OCaml project for deployment.
 */
export async function build(options: BuildOptions) {
  const { config, workPath, entrypoint } = options;

  // Framework preset mode (zero-config)
  if (config?.framework === 'ocaml' || config?.framework === 'services') {
    const resolved = await detectOcamlEntrypoint(workPath, entrypoint);
    if (!resolved) {
      throw new Error(
        `No OCaml entrypoint found. Expected one of: ${OCAML_CANDIDATE_ENTRYPOINTS.join(', ')}`
      );
    }
    debug(`Using OCaml framework preset mode with entrypoint: ${resolved}`);
    return buildStandaloneServer({ ...options, entrypoint: resolved });
  }

  throw new Error(
    'OCaml runtime requires framework preset mode. ' +
      'Ensure dune-project exists in your project root.'
  );
}

/**
 * Start a development server for local development.
 */
export async function startDevServer(
  opts: StartDevServerOptions
): Promise<StartDevServerResult> {
  const { entrypoint, workPath, config } = opts;

  if (config?.framework === 'ocaml' || config?.framework === 'services') {
    const resolved = await detectOcamlEntrypoint(workPath, entrypoint);
    if (!resolved) {
      throw new Error(
        `No OCaml entrypoint found. Expected one of: ${OCAML_CANDIDATE_ENTRYPOINTS.join(', ')}`
      );
    }
    return startStandaloneDevServer(opts, resolved);
  }

  throw new Error(
    'OCaml dev server requires framework preset mode. ' +
      'Ensure dune-project exists in your project root.'
  );
}

/**
 * Prepare cache for subsequent builds.
 *
 * Caches:
 * - opam root directory (compiler + installed packages)
 * - dune _build directory (incremental builds)
 */
export async function prepareCache({
  workPath,
}: PrepareCacheOptions): Promise<Files> {
  const cache: Files = {
    // Cache opam root (compiler switch + installed packages)
    ...(await glob(`${localCacheDir}/**`, workPath)),
    // Cache dune build artifacts for incremental builds
    ...(await glob('_build/**', workPath)),
  };

  debug(`Caching ${Object.keys(cache).length} OCaml build files`);
  return cache;
}
