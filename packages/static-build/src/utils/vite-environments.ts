/**
 * Temporary integration point for the Vite "environments" API.
 *
 * The framework detector currently routes TanStack Start (and other Vite-
 * powered meta-frameworks) through `@vercel/static-build`. That works for the
 * client output, but the per-environment `dist/server/server.js` web-fetch
 * handler produced by frameworks built on Vite's Environments API is ignored
 * — the SSR / server-fn surface effectively breaks.
 *
 * This module fills the gap from inside `static-build`:
 *
 *   1. Detect projects that opt into the path (today: TanStack Start without
 *      a Nitro adapter).
 *   2. Use the project's own `vite` to call `resolveConfig` and learn each
 *      declared environment's `consumer` ('client' | 'server') and `outDir`.
 *   3. Map client envs → static assets; map server envs → a `NodejsLambda`
 *      with `useWebApi: true` (the runtime invokes `default.fetch`, matching
 *      the Web-standard handler shape these bundles emit).
 *
 * Once `@vercel/vite` (or the framework detector) is wired up properly this
 * file can move out unchanged.
 */
import { existsSync, promises as fs } from 'fs';
import { basename, isAbsolute, join, relative, resolve } from 'path';
import { createRequire } from 'module';
import { nodeFileTrace } from '@vercel/nft';
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

interface ResolvedEnvironment {
  name: string;
  consumer: 'client' | 'server';
  outDir: string;
  inputNames: string[];
  conditions: string[];
}

/**
 * Returns true when this project should be handled by the vite-environments
 * path. Today: TanStack Start present and no Nitro opt-in. Keep the trigger
 * narrow until the detector is updated.
 */
export function shouldUseViteEnvironments(
  pkg: PackageJson | null | undefined
): boolean {
  if (!pkg) return false;
  if (!hasTanstackStart(pkg)) return false;
  if (hasNitro(pkg)) return false;
  return true;
}

export async function buildViteEnvironments({
  workPath,
  repoRootPath,
  nodeVersion,
}: {
  workPath: string;
  repoRootPath: string;
  nodeVersion: NodeVersion;
}): Promise<BuildResultV2Typical> {
  const environments = await resolveViteEnvironments(workPath);

  const clientEnvironments = environments.filter(e => e.consumer === 'client');
  const serverEnvironments = environments.filter(e => e.consumer === 'server');

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
      throw new Error(
        `Server environment "${env.name}" declared outDir "${env.outDir}" but it does not exist after build`
      );
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

async function resolveViteEnvironments(
  workPath: string
): Promise<ResolvedEnvironment[]> {
  const projectRequire = createRequire(join(workPath, 'index.js'));
  let vite: typeof import('vite');
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    vite = projectRequire('vite');
  } catch (err) {
    throw new Error(
      `The vite-environments path requires "vite" to be installed in the project. ` +
        `(${(err as Error).message})`
    );
  }

  // `resolveConfig` runs each plugin's `config`/`configResolved` hook, so
  // plugin-contributed environments (e.g. tanstackStart()) are visible.
  const resolved = (await vite.resolveConfig(
    { root: workPath },
    'build'
  )) as ResolvedViteConfig;

  const envs: ResolvedEnvironment[] = [];
  const envMap = resolved.environments ?? {};
  for (const [name, env] of Object.entries(envMap)) {
    const consumer = env.consumer;
    if (consumer !== 'client' && consumer !== 'server') continue;

    const outDirRel = env.build?.outDir ?? resolved.build?.outDir ?? 'dist';
    const outDir = isAbsolute(outDirRel)
      ? outDirRel
      : resolve(resolved.root || workPath, outDirRel);

    envs.push({
      name,
      consumer,
      outDir,
      inputNames: collectInputNames(env.build?.rollupOptions?.input),
      conditions: env.resolve?.conditions ?? [],
    });
  }

  if (envs.length === 0) {
    throw new Error(
      'No vite environments with a "client" or "server" consumer were resolved. ' +
        'Ensure the project uses Vite 6+ and a framework plugin that declares environments.'
    );
  }

  return envs;
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

function hasTanstackStart(pkg: PackageJson): boolean {
  return (
    hasDependency(pkg, '@tanstack/react-start') ||
    hasDependency(pkg, '@tanstack/solid-start')
  );
}

function hasNitro(pkg: PackageJson): boolean {
  return (
    hasDependency(pkg, 'nitropack') ||
    hasDependency(pkg, 'nitro') ||
    hasDependency(pkg, '@tanstack/start-server-nitro')
  );
}

function hasDependency(pkg: PackageJson, name: string): boolean {
  return Boolean(
    pkg.dependencies?.[name] ||
      pkg.devDependencies?.[name] ||
      pkg.peerDependencies?.[name]
  );
}
