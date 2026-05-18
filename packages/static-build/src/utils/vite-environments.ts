/**
 * Integration point for Vite's "environments" API.
 *
 * When a project's vite config declares one or more `environments` with
 * `consumer: 'server'` (TanStack Start, React Router v7, future Hydrogen,
 * custom SSR setups), the per-environment server bundle would otherwise be
 * shipped as a static `.js` and the SSR / server-fn surface would silently
 * break. This module fills that gap from inside `static-build`:
 *
 *   1. After the user's build, call the project's own `vite.resolveConfig`
 *      to learn each declared environment's `consumer` and `outDir`.
 *   2. If at least one server environment has produced output, map every
 *      client `outDir` into static assets and every server `outDir` into
 *      a `NodejsLambda` with `useWebApi: true` — the runtime invokes
 *      `default.fetch`, matching the Web-standard handler these bundles
 *      emit.
 *   3. Otherwise (vite missing, plain SPA, build failed), return `null`
 *      and let `static-build` fall through to its normal path.
 *
 * Lives in `static-build` as a stopgap; once `@vercel/vite` (or the
 * framework detector) is wired up, the module can move out unchanged.
 */
import { existsSync, promises as fs } from 'fs';
import { basename, isAbsolute, join, relative, resolve } from 'path';
import { createRequire } from 'module';
import { nodeFileTrace } from '@vercel/nft';
import { errorToString } from '@vercel/error-utils';
import {
  type BuildResultV2Typical,
  type Files,
  type NodeVersion,
  debug,
  FileFsRef,
  glob,
  NodejsLambda,
} from '@vercel/build-utils';

const SERVER_ENTRY_CANDIDATES = ['server.js', 'index.js', 'entry-server.js'];

interface ViteEnvironmentConfig {
  consumer?: 'client' | 'server';
  build?: {
    outDir?: string;
    rollupOptions?: {
      input?: string | string[] | Record<string, string>;
    };
  };
  resolve?: {
    conditions?: string[];
  };
}

interface ResolvedViteConfig {
  root: string;
  environments?: Record<string, ViteEnvironmentConfig>;
  build?: {
    outDir?: string;
  };
}

export interface ResolvedEnvironment {
  name: string;
  consumer: 'client' | 'server';
  outDir: string;
  inputNames: string[];
  conditions: string[];
}

export interface ViteEnvironmentsDetection {
  environments: ResolvedEnvironment[];
}

/**
 * Cheaply attempts to discover vite environments with server output on disk.
 * Returns `null` when there's nothing to do — caller should fall through to
 * the normal static-build path. Never throws on the "not a vite project"
 * cases; only throws if vite *is* present and resolveConfig blows up in a
 * way we can't recover from.
 */
export async function detectViteServerEnvironments(
  workPath: string
): Promise<ViteEnvironmentsDetection | null> {
  // Pre-check: is vite resolvable from this project at all? If not, this
  // isn't a vite build and we shouldn't pay the cost of resolveConfig.
  const projectRequire = createRequire(join(workPath, 'index.js'));
  let vite: typeof import('vite');
  try {
    vite = projectRequire('vite');
  } catch {
    return null;
  }

  if (typeof vite.resolveConfig !== 'function') {
    debug('Detected vite, but `resolveConfig` is missing — skipping');
    return null;
  }

  // `resolveConfig` runs each plugin's `config`/`configResolved` hook, so
  // plugin-contributed environments (e.g. tanstackStart()) become visible.
  let resolved: ResolvedViteConfig;
  try {
    resolved = (await vite.resolveConfig(
      { root: workPath },
      'build'
    )) as ResolvedViteConfig;
  } catch (err) {
    debug(`vite.resolveConfig failed: ${errorToString(err)}`);
    return null;
  }

  const environments: ResolvedEnvironment[] = [];
  for (const [name, env] of Object.entries(resolved.environments ?? {})) {
    const consumer = env.consumer;
    if (consumer !== 'client' && consumer !== 'server') continue;

    const outDirRel = env.build?.outDir ?? resolved.build?.outDir ?? 'dist';
    const outDir = isAbsolute(outDirRel)
      ? outDirRel
      : resolve(resolved.root || workPath, outDirRel);

    environments.push({
      name,
      consumer,
      outDir,
      inputNames: collectInputNames(env.build?.rollupOptions?.input),
      conditions: env.resolve?.conditions ?? [],
    });
  }

  // Prune phantom server environments before deciding whether to take over.
  // Some Vite plugins (e.g. @sveltejs/vite-plugin-svelte) register a default
  // `ssr` environment even when the user is shipping a plain client SPA.
  // Its outDir defaults to `dist`, which is also where the client built,
  // so a naive existsSync check would fire for every Vite project. Real
  // SSR frameworks (TanStack Start, RR v7, Hydrogen) always use a distinct
  // outDir for the server bundle, and even if they didn't, we couldn't pick
  // apart a server entry from client SPA files in a shared directory.
  const clientOutDirs = new Set(
    environments.filter(e => e.consumer === 'client').map(e => e.outDir)
  );
  const filtered = environments.filter(env => {
    if (env.consumer !== 'server') return true;
    if (clientOutDirs.has(env.outDir)) return false;
    return existsSync(env.outDir);
  });

  const hasBuiltServer = filtered.some(e => e.consumer === 'server');
  if (!hasBuiltServer) return null;

  return { environments: filtered };
}

export async function buildViteEnvironments({
  workPath,
  repoRootPath,
  nodeVersion,
  detection,
}: {
  workPath: string;
  repoRootPath: string;
  nodeVersion: NodeVersion;
  detection: ViteEnvironmentsDetection;
}): Promise<BuildResultV2Typical> {
  const clientEnvironments = detection.environments.filter(
    e => e.consumer === 'client'
  );
  const serverEnvironments = detection.environments.filter(
    e => e.consumer === 'server'
  );

  let staticFiles: Files = {};
  for (const env of clientEnvironments) {
    if (!existsSync(env.outDir)) {
      debug(
        `Skipping client environment "${env.name}": outDir ${env.outDir} does not exist`
      );
      continue;
    }
    const found = await glob('**', env.outDir);
    staticFiles = { ...staticFiles, ...found };
  }

  const output: BuildResultV2Typical['output'] = { ...staticFiles };
  let primaryServerFunctionPath: string | undefined;

  for (const env of serverEnvironments) {
    if (!existsSync(env.outDir)) {
      // Server env declared but not built — skip rather than fail, since
      // `detectViteServerEnvironments` already confirmed at least one
      // server env did produce output.
      debug(
        `Skipping server environment "${env.name}": outDir ${env.outDir} does not exist`
      );
      continue;
    }

    const entryFile = await findServerEntry(env);
    if (!entryFile) {
      throw new Error(
        `Could not locate the server entry file inside "${env.outDir}" for environment "${env.name}". Expected a top-level .js entry (e.g. server.js, index.js).`
      );
    }

    const fn = await createServerFunction({
      entryAbsolutePath: entryFile,
      rootDir: repoRootPath,
      entrypointDir: workPath,
      nodeVersion,
      conditions: env.conditions,
      environmentName: env.name,
    });

    const outputPath =
      serverEnvironments.length === 1 || env.name === 'server'
        ? 'index'
        : `__vite/${env.name}`;
    output[outputPath] = fn;
    if (!primaryServerFunctionPath) {
      primaryServerFunctionPath = outputPath;
    }
  }

  const routes: BuildResultV2Typical['routes'] = [{ handle: 'filesystem' }];
  if (primaryServerFunctionPath) {
    routes.push({ src: '/(.*)', dest: `/${primaryServerFunctionPath}` });
  }
  routes.push({ handle: 'hit' });
  routes.push({
    src: '^/assets/(.*)$',
    headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    continue: true,
  });

  return { routes, output };
}

function collectInputNames(
  input: string | string[] | Record<string, string> | undefined
): string[] {
  if (!input) return [];
  if (typeof input === 'string') return [stripExt(basename(input))];
  if (Array.isArray(input)) return input.map(i => stripExt(basename(i)));
  return Object.keys(input);
}

function stripExt(filename: string) {
  return filename.replace(/\.[^.]+$/, '');
}

async function findServerEntry(
  env: ResolvedEnvironment
): Promise<string | null> {
  // 1) Prefer a name matching the rollup input (e.g. "server" → "server.js").
  for (const name of env.inputNames) {
    const candidate = join(env.outDir, `${name}.js`);
    if (existsSync(candidate)) return candidate;
  }
  // 2) Well-known names.
  for (const name of SERVER_ENTRY_CANDIDATES) {
    const candidate = join(env.outDir, name);
    if (existsSync(candidate)) return candidate;
  }
  // 3) Lone top-level .js file in the env's outDir.
  const entries = await fs.readdir(env.outDir, { withFileTypes: true });
  const topLevelJs = entries.filter(e => e.isFile() && e.name.endsWith('.js'));
  if (topLevelJs.length === 1) {
    return join(env.outDir, topLevelJs[0].name);
  }
  return null;
}

async function createServerFunction({
  entryAbsolutePath,
  rootDir,
  entrypointDir,
  nodeVersion,
  conditions,
  environmentName,
}: {
  entryAbsolutePath: string;
  rootDir: string;
  entrypointDir: string;
  nodeVersion: NodeVersion;
  conditions: string[];
  environmentName: string;
}) {
  const traceConditions = conditions.length
    ? conditions
    : ['node', 'import', 'require', 'default'];

  const trace = await nodeFileTrace([entryAbsolutePath], {
    base: rootDir,
    processCwd: entrypointDir,
    conditions: traceConditions,
  });

  for (const warning of trace.warnings) {
    debug(`nft warning (vite/${environmentName}): ${warning.message}`);
  }

  const files: Files = {};
  for (const file of trace.fileList) {
    files[file] = await FileFsRef.fromFsPath({ fsPath: join(rootDir, file) });
  }

  const handler = relative(rootDir, entryAbsolutePath);

  return new NodejsLambda({
    files,
    handler,
    runtime: nodeVersion.runtime,
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: false,
    operationType: 'SSR',
    supportsResponseStreaming: true,
    useWebApi: true,
  });
}
