// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import {
  EdgeFunction,
  FileFsRef,
  Lambda,
  NodejsLambda,
  NowBuildError,
  Prerender,
  type Files,
  type Env,
  type HasField,
  type TriggerEvent,
  type PrerenderInitialMetadata,
} from '@vercel/build-utils';
import {
  createFunctionEntriesIterator,
  type FunctionDirEntry,
} from './create-functions-iterator';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { glob } from '../glob';
import { isNativeError } from 'node:util/types';
import { maybeReadJSON } from '../../maybe-read-json';
import { readlink, realpath } from 'node:fs/promises';

type FileFsRefsCache = Map<string, FileFsRef | Promise<FileFsRef>>;

export interface FunctionOutputs {
  edgeFunctions: Map<string, EdgeFunction>;
  lambdas: Map<string, Lambda>;
  prerenders: Map<string, Prerender & { lambda: Lambda }>;
}

export interface ReadFunctionsOptions {
  concurrency?: number;
  outputDir: string;
  prebuilt?: boolean;
  repoRootPath: string;
}

export async function readFunctions(
  params: ReadFunctionsOptions
): Promise<FunctionOutputs & { serverActionsManifestPaths: Set<string> }> {
  const fileFsRefsCache: FileFsRefsCache = new Map();
  const entries: DeserializedFunctionEntry[] = [];
  const functionsDir = join(params.outputDir, 'functions');
  const iterator = enumerate(createFunctionEntriesIterator(functionsDir));

  await Promise.all(
    Array.from({ length: params.concurrency ?? 32 }, async () => {
      for await (const [index, entry] of iterator) {
        entries[index] = await deserializeFunctionEntry({
          prebuilt: params.prebuilt,
          entry,
          fileFsRefsCache,
          functionsDir,
          repoRootPath: params.repoRootPath,
        });
      }
    })
  );

  const serverActionsManifestPaths = new Set<string>();
  const edgeFunctions = new Map<string, EdgeFunction>();
  const unsortedPrerenders = new Map<string, Prerender>();
  const functionSymlinks = new Map<string, string>();
  const lambdas = new Map<string, Lambda>();

  /**
   * Index concrete Lambdas, Edge Functions, Prerenders, function symlinks,
   * and server actions manifest paths by output path. All concrete targets
   * must be indexed before symlinks can be resolved.
   */
  for (const functionEntry of entries) {
    if (functionEntry.symlinkTarget !== undefined) {
      functionSymlinks.set(functionEntry.path, functionEntry.symlinkTarget);
    }

    if (functionEntry.serverActionsManifestPath) {
      serverActionsManifestPaths.add(functionEntry.serverActionsManifestPath);
    }

    if (functionEntry.output?.type === 'Prerender') {
      unsortedPrerenders.set(functionEntry.path, functionEntry.output);
    } else if (functionEntry.output?.type === 'Lambda') {
      lambdas.set(functionEntry.path, functionEntry.output);
    } else if (functionEntry.output?.type === 'EdgeFunction') {
      edgeFunctions.set(functionEntry.path, functionEntry.output);
    }
  }

  /**
   * Resolve function symlinks in entry order. A target may be a concrete
   * Lambda or Edge Function, a prerender's Lambda, or a previously resolved
   * symlink; unresolved targets fail deserialization.
   *
   * A regular symlink path is added as an alias of the target function. If
   * the symlink path has a prerender wrapper, its target must be a Lambda
   * and replaces the wrapper's Lambda.
   */
  for (const [path, target] of functionSymlinks) {
    const destFunction =
      unsortedPrerenders.get(target)?.lambda ??
      edgeFunctions.get(target) ??
      lambdas.get(target);

    if (!destFunction) {
      throw new Error(
        `Could not find target "${target}" Lambda or EdgeFunction for path "${path}"`
      );
    }

    const srcPrerender = unsortedPrerenders.get(path);
    if (!srcPrerender) {
      if (destFunction.type === 'Lambda') {
        lambdas.set(path, destFunction);
      } else if (destFunction.type === 'EdgeFunction') {
        edgeFunctions.set(path, destFunction);
      }
    } else {
      if (destFunction.type !== 'Lambda') {
        throw new Error(
          `Unexpected function type "${destFunction.type}" at path "${path}"`
        );
      }
      srcPrerender.lambda = destFunction;
    }
  }

  /**
   * Preserve the established prerender output order by sorting by `group`,
   * matching the order produced by `@vercel/next`.
   *
   * This may no longer be necessary. The sort was introduced alongside a
   * workaround that required prerenders to appear after Lambdas in the final
   * output object. Keeping the sort avoids changing output iteration order as
   * part of this refactor; it should be evaluated separately before removal.
   */
  const prerenders = new Map<string, Prerender & { lambda: Lambda }>();
  for (const [path, prerender] of [...unsortedPrerenders].sort(
    (a, b) => (a[1].group ?? 0) - (b[1].group ?? 0)
  )) {
    validatePrerender(prerender);
    prerenders.set(path, prerender);
  }

  return {
    edgeFunctions,
    lambdas,
    prerenders,
    serverActionsManifestPaths,
  };
}

async function* enumerate<T>(
  iterable: AsyncIterable<T>
): AsyncGenerator<[number, T]> {
  let index = 0;
  for await (const item of iterable) {
    yield [index++, item];
  }
}

interface DeserializedFunctionEntry {
  output?: Lambda | EdgeFunction | Prerender;
  path: string;
  serverActionsManifestPath?: string;
  symlinkTarget?: string;
}

interface SerializedLambda {
  type: 'Lambda';
  runtime: string;
  handler: string;
  runtimeLanguage?: 'rust' | 'go';
  architecture?: 'arm64' | 'x86_64';
  environment?: Env;
  memory?: number;
  maxDuration?: number | 'max';
  affinity?: { mode: 'strict' };
  maxConcurrency?: number;
  allowQuery?: string[];
  regions?: string[];
  functionFailoverRegions?: string[];
  supportsMultiPayloads?: boolean;
  supportsWrapper?: boolean;
  supportsResponseStreaming?: boolean;
  experimentalResponseStreaming?: boolean;
  operationType?: string;
  framework?: { slug: string; version?: string };
  experimentalAllowBundling?: boolean;
  experimentalTriggers?: TriggerEvent[];
  supportsCancellation?: boolean;
  shouldDisableAutomaticFetchInstrumentation?: boolean;
}

interface SerializedNodejsLambda extends SerializedLambda {
  launcherType: 'Nodejs';
  shouldAddHelpers: boolean;
  shouldAddSourcemapSupport: boolean;
  awsLambdaHandler?: string;
  useWebApi?: boolean;
}

interface SerializedEdgeFunction {
  type: 'EdgeFunction';
  entrypoint: string;
  environment?: Env;
  assets?: { name: string; path: string }[];
  regions?: string | string[];
  framework?: { slug: string; version?: string };
}

interface SerializedPrerender {
  allowHeader?: string[];
  allowQuery?: string[];
  bypassToken?: string | null;
  chain?: { outputPath: string; headers: Record<string, string> };
  experimentalBypassFor?: HasField;
  experimentalStreamingLambdaPath?: string;
  expiration: number | false;
  exposeErrBody?: boolean;
  group?: number;
  initialHeaders?: Record<string, string>;
  initialMetadata?: unknown;
  initialStatus?: number;
  partialFallback?: boolean;
  passQuery?: boolean;
  sourcePath?: string;
  staleExpiration?: number;
  fallback:
    | { fsPath: string; mode?: number; size?: number; contentType?: string }
    | string
    | null;
}

type FunctionConfig = (
  | SerializedEdgeFunction
  | SerializedLambda
  | SerializedNodejsLambda
) & { filePathMap?: Record<string, string> };

async function deserializeFunctionEntry(params: {
  entry: FunctionDirEntry;
  fileFsRefsCache: FileFsRefsCache;
  functionsDir: string;
  prebuilt?: boolean;
  repoRootPath: string;
}): Promise<DeserializedFunctionEntry> {
  const functionDir = join(params.functionsDir, `${params.entry.path}.func`);
  const prerenderConfigPath = join(
    params.functionsDir,
    `${params.entry.path}.prerender-config.json`
  );

  const configPromise = params.entry.hasPrerenderConfig
    ? maybeReadJSON<SerializedPrerender>(prerenderConfigPath)
    : undefined;

  void configPromise?.catch(() => {});

  let lambda: Lambda | undefined;
  let serverActionsManifestPath: string | undefined;
  let symlinkTarget: string | undefined;

  if (params.entry.isSymbolicLink) {
    symlinkTarget = await readlink(functionDir).then(link =>
      join(dirname(params.entry.path), link).slice(0, -'.func'.length)
    );
  } else {
    const functionConfigPath = join(functionDir, '.vc-config.json');
    const [functionConfig, files] = await Promise.all([
      maybeReadJSON<FunctionConfig>(functionConfigPath),
      glob({ cwd: functionDir, includeDirectories: true }),
    ]);

    if (!functionConfig) {
      throw new Error(
        `Could not load function config: "${functionConfigPath}"`
      );
    }

    delete files['.vc-config.json'];

    if (functionConfig.filePathMap) {
      await hydrateFilesMap(
        files,
        functionConfig.filePathMap,
        params.repoRootPath,
        params.fileFsRefsCache,
        params.prebuilt
      );
    }

    if (
      ('type' in functionConfig && functionConfig.type === 'EdgeFunction') ||
      functionConfig.runtime === 'edge'
    ) {
      return {
        path: params.entry.path,
        output: new EdgeFunction({
          deploymentTarget: 'v8-worker',
          ...(functionConfig as SerializedEdgeFunction),
          files,
        }),
      };
    }

    const supportsResponseStreaming =
      functionConfig.supportsResponseStreaming ??
      functionConfig.experimentalResponseStreaming;

    lambda =
      'launcherType' in functionConfig &&
      functionConfig.launcherType === 'Nodejs'
        ? new NodejsLambda({
            ...functionConfig,
            files,
            supportsResponseStreaming:
              functionConfig.awsLambdaHandler === undefined ||
              functionConfig.awsLambdaHandler === '' ||
              supportsResponseStreaming,
          })
        : new Lambda({ ...functionConfig, files, supportsResponseStreaming });

    serverActionsManifestPath =
      functionConfig.filePathMap?.[
        '.next/server/server-reference-manifest.json'
      ];
  }

  if (configPromise) {
    const prerenderConfig = await configPromise;
    if (prerenderConfig) {
      return {
        path: params.entry.path,
        symlinkTarget,
        serverActionsManifestPath,
        output: new Prerender({
          ...prerenderConfig,
          fallback: await deserializePrerenderFallback(
            prerenderConfigPath,
            prerenderConfig.fallback,
            params
          ),
          initialMetadata: sanitizeInitialMetadata(
            prerenderConfig.initialMetadata
          ),
          lambda,
        }),
      };
    }
  }

  return {
    path: params.entry.path,
    symlinkTarget,
    output: lambda,
    serverActionsManifestPath,
  };
}

function validatePrerender(prerender: {
  lambda?: Lambda;
}): asserts prerender is { lambda: Lambda } {
  if (prerender.lambda === undefined) {
    throw new Error('Prerender "buildResult" is missing "lambda" property');
  }
}

async function hydrateFilesMap(
  files: Files,
  filesMap: Record<string, string>,
  repoRootPath: string,
  fileFsRefsCache: FileFsRefsCache,
  prebuilt: boolean | undefined
) {
  const rootPath = prebuilt ? await realpath(repoRootPath) : undefined;

  async function hydrateFile(projectPath: string) {
    const fsPath = join(repoRootPath, projectPath);
    if (rootPath !== undefined) {
      await validatePrebuiltFilePath(
        fsPath,
        rootPath,
        `file map source "${projectPath}"`,
        true
      );
    }
    const file = await FileFsRef.fromFsPath({ fsPath });
    fileFsRefsCache.set(projectPath, file);
    return file;
  }

  let pending: Promise<void>[] | undefined;
  for (const functionPath in filesMap) {
    const projectPath = filesMap[functionPath]!;
    const cached = fileFsRefsCache.get(projectPath);
    if (cached && !(cached instanceof Promise)) {
      files[functionPath] = cached;
      continue;
    }
    let filePromise = cached;
    if (!filePromise) {
      const promise = hydrateFile(projectPath);
      fileFsRefsCache.set(projectPath, promise);
      filePromise = promise;
    }
    (pending ??= []).push(
      filePromise.then(file => {
        files[functionPath] = file;
      })
    );
  }
  if (pending) await Promise.all(pending);
}

async function validatePrebuiltFilePath(
  fsPath: string,
  rootPath: string,
  source: string,
  enableDanglingSymlinks = false
): Promise<string> {
  let resolvedPath: string;
  try {
    resolvedPath = await realpath(fsPath);
  } catch (error) {
    if (
      !enableDanglingSymlinks ||
      !isNativeError(error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    ) {
      throw error;
    }
    const target = await readlink(fsPath);
    const parentPath = await validatePrebuiltFilePath(
      dirname(fsPath),
      rootPath,
      source
    );
    resolvedPath = resolve(parentPath, target);
  }
  const sourcePath = relative(rootPath, resolvedPath);
  if (
    sourcePath === '..' ||
    sourcePath.startsWith(`..${sep}`) ||
    isAbsolute(sourcePath)
  ) {
    throw new NowBuildError({
      code: 'INVALID_PREBUILT_FILE_PATH',
      message: `Prebuilt ${source} must be inside the uploaded project.`,
    });
  }
  return resolvedPath;
}

// Prerender metadata is customer-authored; retain only valid serving fields.
function sanitizeInitialMetadata(
  initialMetadata: unknown
): PrerenderInitialMetadata | undefined {
  try {
    if (
      typeof initialMetadata !== 'object' ||
      initialMetadata === null ||
      Array.isArray(initialMetadata)
    )
      return undefined;

    const { compute, htmlSize } = initialMetadata as Record<string, unknown>;
    if (
      compute !== 'blocking' &&
      compute !== 'resuming' &&
      compute !== 'static'
    )
      return undefined;
    if (
      htmlSize !== undefined &&
      (!Number.isSafeInteger(htmlSize) || (htmlSize as number) < 0)
    )
      return undefined;

    return {
      compute,
      ...(htmlSize !== undefined && { htmlSize: htmlSize as number }),
    };
  } catch {
    return undefined;
  }
}

async function deserializePrerenderFallback(
  prerenderConfigPath: string,
  fallback: SerializedPrerender['fallback'],
  options: Pick<ReadFunctionsOptions, 'prebuilt' | 'repoRootPath'>
) {
  if (fallback === null || fallback === undefined) {
    return null;
  }

  const path = typeof fallback === 'string' ? fallback : fallback.fsPath;
  const fsPath = join(dirname(prerenderConfigPath), path);
  if (options.prebuilt) {
    await validatePrebuiltFilePath(
      fsPath,
      await realpath(options.repoRootPath),
      `prerender fallback "${path}"`
    );
  }

  if (typeof fallback === 'string') {
    return FileFsRef.fromFsPath({ fsPath });
  } else if (fallback.mode !== undefined) {
    return new FileFsRef({
      mode: fallback.mode,
      size: fallback.size,
      contentType: fallback.contentType,
      fsPath,
    });
  } else {
    return FileFsRef.fromFsPath({
      mode: fallback.mode,
      size: fallback.size,
      contentType: fallback.contentType,
      fsPath,
    });
  }
}
