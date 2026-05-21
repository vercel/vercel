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
  type PackageJson,
  debug,
  FileFsRef,
  glob,
  NodejsLambda,
} from '@vercel/build-utils';
import { shouldInjectNitroForProject } from './vite-ssr-heuristics';

const SERVER_ENTRY_CANDIDATES = ['server.js', 'index.js', 'entry-server.js'];

// TanStack Start / RR v7 often hang inside plugin hooks during resolveConfig.
const RESOLVE_CONFIG_TIMEOUT_MS = 120_000;

const BUILT_ENV_LAYOUTS = [
  {
    clientName: 'client',
    serverName: 'server',
    client: 'dist/client',
    server: 'dist/server',
  },
  {
    clientName: 'client',
    serverName: 'server',
    client: 'build/client',
    server: 'build/server',
  },
] as const;

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

// Resolved environments are cached per workPath. `resolveConfig` runs every
// plugin's `config`/`configResolved` hook, which for some frameworks is
// non-trivial (route-tree codegen, content-collections scans). Pre-build
// and post-build paths both want the same answer; memoize so we don't pay
// twice.
const envCache = new Map<string, Promise<ResolvedEnvironment[] | null>>();

/**
 * Test helper. The cache lives at module scope so it survives across
 * vitest cases in the same worker; call this in `beforeEach` to keep
 * tests independent.
 */
export function _resetViteEnvironmentsCacheForTests(): void {
  envCache.clear();
}

/**
 * Resolve the vite environments declared by the project (after pruning
 * phantom server envs that share their outDir with a client env). Returns
 * `null` when this isn't a vite project or resolveConfig fails. Does NOT
 * check that the outDirs exist on disk — that's the caller's job for the
 * post-build path. Memoized.
 */
export async function getViteEnvironments(
  workPath: string
): Promise<ResolvedEnvironment[] | null> {
  const cached = envCache.get(workPath);
  if (cached) return cached;
  const promise = loadViteEnvironments(workPath);
  envCache.set(workPath, promise);
  return promise;
}

async function loadViteEnvironments(
  workPath: string
): Promise<ResolvedEnvironment[] | null> {
  // Pre-check: is vite resolvable from this project at all? If not, this
  // isn't a vite build and we shouldn't pay the cost of resolveConfig.
  // `createRequire` uses the path only as a resolution anchor — Node walks
  // up its dirname looking for `node_modules`. The file is never opened,
  // so the basename here is arbitrary.
  const projectRequire = createRequire(join(workPath, '__vite_detect__'));
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
    resolved = (await promiseWithTimeout(
      vite.resolveConfig(
        { root: workPath },
        'build'
      ) as Promise<ResolvedViteConfig>,
      RESOLVE_CONFIG_TIMEOUT_MS,
      'vite.resolveConfig timed out'
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

  // Prune phantom server environments. Some Vite plugins (e.g.
  // @sveltejs/vite-plugin-svelte, and Vite itself) register a default `ssr`
  // environment even when the user is shipping a plain client SPA. Its
  // outDir defaults to `dist`, which is also where the client built — so
  // anything that shares an outDir with a client env isn't a real SSR
  // setup we should be wrapping or handing to Nitro.
  const clientOutDirs = new Set(
    environments.filter(e => e.consumer === 'client').map(e => e.outDir)
  );
  return environments.filter(env => {
    if (env.consumer !== 'server') return true;
    return !clientOutDirs.has(env.outDir);
  });
}

/**
 * Pre-build check for Nitro injection. Does not call `vite.resolveConfig`
 * (TanStack Start plugins can hang the build container there).
 */
export function projectDeclaresViteServerEnvironment(
  workPath: string,
  pkg?: PackageJson | null
): boolean {
  return shouldInjectNitroForProject(workPath, pkg);
}

/**
 * Post-build check: map built SSR output without calling `vite.resolveConfig`.
 * Re-running vite's config pipeline after `vite build` can hang on TanStack
 * Start (route-tree codegen, etc.) and leaves the build log silent until kill.
 */
export async function detectViteServerEnvironments(
  workPath: string,
  _pkg?: PackageJson | null
): Promise<ViteEnvironmentsDetection | null> {
  const onDisk = await detectBuiltViteEnvironmentsOnDisk(workPath);
  if (onDisk) {
    console.log(
      `Found Vite SSR output on disk (${onDisk.environments
        .filter(e => e.consumer === 'server')
        .map(e => relative(workPath, e.outDir))
        .join(
          ', '
        )}); mapping server bundle to a Vercel Function without re-running vite.`
    );
    return onDisk;
  }

  debug(
    'No dist/client + dist/server (or build/client + build/server) layout after build; skipping post-build vite-environments path'
  );
  return null;
}

async function detectBuiltViteEnvironmentsOnDisk(
  workPath: string
): Promise<ViteEnvironmentsDetection | null> {
  for (const layout of BUILT_ENV_LAYOUTS) {
    const clientOut = join(workPath, layout.client);
    const serverOut = join(workPath, layout.server);
    if (clientOut === serverOut) continue;
    if (!existsSync(clientOut) || !existsSync(serverOut)) continue;
    if (!(await serverOutDirHasJsEntry(serverOut))) continue;

    return {
      environments: [
        {
          name: layout.clientName,
          consumer: 'client',
          outDir: clientOut,
          inputNames: [],
          conditions: ['browser', 'import'],
        },
        {
          name: layout.serverName,
          consumer: 'server',
          outDir: serverOut,
          inputNames: ['server'],
          conditions: ['node', 'import', 'require'],
        },
      ],
    };
  }
  return null;
}

async function serverOutDirHasJsEntry(serverOut: string): Promise<boolean> {
  const entries = await fs.readdir(serverOut, { withFileTypes: true });
  return entries.some(e => e.isFile() && e.name.endsWith('.js'));
}

function promiseWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
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

  console.log(
    `Detected Vite environments: ${detection.environments
      .map(e => `${e.name} (${e.consumer}) → ${relative(workPath, e.outDir)}`)
      .join(', ')}`
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
    console.log(
      `Collected ${Object.keys(found).length} static asset(s) from "${
        env.name
      }" (${relative(workPath, env.outDir)})`
    );
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

    console.log(
      `Tracing server bundle and creating Vercel Function from "${env.name}" → ${relative(
        workPath,
        entryFile
      )} (this can take a minute on large apps)`
    );

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
