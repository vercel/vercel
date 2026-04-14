import * as fs from 'fs-extra';
import { dirname, join } from 'path';
import type { BuildResultV2Typical } from '../types';
import { createFunctionsIterator } from './create-functions-iterator';
import {
  deserializeEdgeFunction,
  type DeserializeEdgeFunctionOptions,
} from './deserialize-edge-function';
import {
  deserializeLambda,
  type DeserializeLambdaOptions,
} from './deserialize-lambda';
import FileFsRef from '../file-fs-ref';
import glob from '../fs/glob';
import { EdgeFunction } from '../edge-function';
import { Lambda } from '../lambda';
import { Prerender } from '../prerender';
import { maybeReadJSON } from './maybe-read-json';
import { validateFrameworkVersion } from './validate-framework-version';
import type {
  BuildOutputConfig,
  BuildResultV2TypicalWithCron,
  DeploymentFlags,
  SerializedEdgeFunction,
  SerializedLambda,
  SerializedNodejsLambda,
  SerializedPrerender,
} from './types';

export type DeserializeBuildOutputMeta = NonNullable<
  BuildResultV2TypicalWithCron['meta']
>;

export interface DeserializeBuildOutputInspectLambdaOptions<
  TLambda extends Lambda = Lambda,
> {
  path: string;
  config: SerializedLambda | SerializedNodejsLambda;
  lambda: TLambda;
  repoRootPath: string;
}

export interface DeserializeBuildOutputGroupLambdasOptions {
  lambdas: Record<string, Lambda>;
  maxBundleSizeMb?: number;
  debug?: boolean;
}

export interface DeserializeBuildOutputCoreResult {
  config: BuildOutputConfig;
  flags?: DeploymentFlags;
  output: BuildResultV2Typical['output'];
  framework?: BuildResultV2Typical['framework'];
  meta?: DeserializeBuildOutputMeta;
}

export interface DeserializeBuildOutputCoreOptions<
  TLambda extends Lambda = Lambda,
  TEdgeFunction extends EdgeFunction = EdgeFunction,
> {
  outputDir: string;
  repoRootPath: string;
  maxBundleSizeMb?: number;
  debugGroupLambdas?: boolean;
  useOnlyStreamingLambda?: boolean;
  forceNodejsStreaming?: boolean;
  createLambda?: DeserializeLambdaOptions<TLambda>['createLambda'];
  createNodejsLambda?: DeserializeLambdaOptions<TLambda>['createNodejsLambda'];
  createEdgeFunction?: DeserializeEdgeFunctionOptions<TEdgeFunction>['createEdgeFunction'];
  groupLambdas?: (
    options: DeserializeBuildOutputGroupLambdasOptions
  ) => Promise<Record<string, Lambda>> | Record<string, Lambda>;
  inspectLambda?: (
    options: DeserializeBuildOutputInspectLambdaOptions<TLambda>
  ) =>
    | Promise<Partial<DeserializeBuildOutputMeta> | void>
    | Partial<DeserializeBuildOutputMeta>
    | void;
  validateConfig?: (config: BuildOutputConfig) => Promise<void> | void;
  warn?: (message: string) => void;
}

function applyOutputOverrides(
  output: BuildResultV2Typical['output'],
  overrides: BuildOutputConfig['overrides'],
  warn: (message: string) => void
): void {
  for (const [name, override] of Object.entries(overrides || {})) {
    const entry = output[name] as FileFsRef | undefined;
    if (entry) {
      if (override.contentType) {
        entry.contentType = override.contentType;
      }
      if (override.mode) {
        entry.mode = override.mode;
      }
      if (override.path) {
        output[override.path] = entry;
        delete output[name];
      }
    } else {
      warn(
        `Warning: Override path "${name}" was not detected as an output path`
      );
    }
  }
}

async function deserializePrerenderFallback(
  prerenderConfigPath: string,
  fallbackConfig: SerializedPrerender['fallback']
): Promise<Prerender['fallback']> {
  if (typeof fallbackConfig === 'string') {
    return FileFsRef.fromFsPath({
      fsPath: join(dirname(prerenderConfigPath), fallbackConfig),
    });
  }

  if (fallbackConfig) {
    return FileFsRef.fromFsPath({
      mode: fallbackConfig.mode,
      contentType: fallbackConfig.contentType,
      fsPath: join(dirname(prerenderConfigPath), fallbackConfig.fsPath),
    });
  }

  return null;
}

function applyFunctionSymlinks(
  output: BuildResultV2Typical['output'],
  prerenders: Map<string, Prerender>,
  functionSymlinks: Map<string, string>
): void {
  for (const [path, target] of functionSymlinks.entries()) {
    const targetOutput = prerenders.get(target) || output[target];
    let targetFunction: Lambda | EdgeFunction | undefined;
    if (targetOutput?.type === 'Prerender') {
      targetFunction = targetOutput.lambda;
    } else if (
      targetOutput?.type === 'Lambda' ||
      targetOutput?.type === 'EdgeFunction'
    ) {
      targetFunction = targetOutput;
    }
    if (!targetFunction) {
      throw new Error(
        `Could not find target "${target}" Lambda or EdgeFunction for path "${path}"`
      );
    }

    const srcOutput = prerenders.get(path);
    if (srcOutput) {
      if (srcOutput.type === 'Prerender') {
        if (targetFunction.type === 'Lambda') {
          srcOutput.lambda = targetFunction;
        } else {
          throw new Error(
            `Unexpected function type "${targetFunction.type}" at path "${path}"`
          );
        }
      } else {
        throw new Error(
          `Unexpected output type "${srcOutput.type}" at path "${path}"`
        );
      }
    } else {
      output[path] = targetFunction;
    }
  }
}

function appendSortedPrerenders(
  output: BuildResultV2Typical['output'],
  prerenders: Map<string, Prerender>
): void {
  const sortedPrerenders = Array.from(prerenders.entries())
    .sort((a, b) => {
      return (a[1].group ?? 0) - (b[1].group ?? 0);
    })
    .reduce<Record<string, Prerender>>((result, [path, prerender]) => {
      result[path] = prerender;
      return result;
    }, {});

  Object.assign(output, sortedPrerenders);
}

function getBundleableLambdas(
  output: BuildResultV2Typical['output']
): Record<string, Lambda> {
  const bundleableLambdas: Record<string, Lambda> = {};

  for (const [outputName, curOutput] of Object.entries(output)) {
    if (curOutput.type === 'Lambda' && curOutput.experimentalAllowBundling) {
      bundleableLambdas[outputName] = curOutput;
    } else if (
      curOutput.type === 'Prerender' &&
      curOutput.lambda &&
      curOutput.lambda.experimentalAllowBundling
    ) {
      bundleableLambdas[outputName] = curOutput.lambda;
    }
  }

  return bundleableLambdas;
}

function applyGroupedLambdas(
  output: BuildResultV2Typical['output'],
  groupedLambdas: Record<string, Lambda>
): void {
  for (const outputName of Object.keys(groupedLambdas)) {
    const groupedLambda = groupedLambdas[outputName];
    const origOutput = output[outputName];

    if (origOutput.type === 'Lambda') {
      output[outputName] = groupedLambda;
    } else if (origOutput.type === 'Prerender' && origOutput.lambda) {
      origOutput.lambda = groupedLambda;
    }
  }
}

function getErrorCode(error: unknown): unknown {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code?: unknown }).code;
  }
  return undefined;
}

async function defaultGroupLambdas({
  lambdas,
}: DeserializeBuildOutputGroupLambdasOptions): Promise<Record<string, Lambda>> {
  return lambdas;
}

export async function deserializeBuildOutputCore<
  TLambda extends Lambda = Lambda,
  TEdgeFunction extends EdgeFunction = EdgeFunction,
>({
  outputDir,
  repoRootPath,
  maxBundleSizeMb,
  debugGroupLambdas,
  useOnlyStreamingLambda,
  forceNodejsStreaming,
  createLambda,
  createNodejsLambda,
  createEdgeFunction,
  groupLambdas,
  inspectLambda,
  validateConfig,
  warn = console.warn,
}: DeserializeBuildOutputCoreOptions<
  TLambda,
  TEdgeFunction
>): Promise<DeserializeBuildOutputCoreResult> {
  const configPath = join(outputDir, 'config.json');
  const config = await maybeReadJSON<BuildOutputConfig>(configPath);

  if (!config) {
    throw new Error(`Config file was not found at "${configPath}"`);
  }

  if (config.version !== 3) {
    throw new Error(
      `Expected \`version: 3\` in "${configPath}" file (received \`${config.version}\`)`
    );
  }

  await validateConfig?.(config);

  const flags = await maybeReadJSON<DeploymentFlags>(
    join(outputDir, 'flags.json')
  );

  const staticDir = join(outputDir, 'static');
  const output: BuildResultV2Typical['output'] = await glob('**', {
    cwd: staticDir,
    follow: true,
  });

  applyOutputOverrides(output, config.overrides, warn);

  const fileFsRefsCache = new Map<string, FileFsRef>();

  // Existing callers require Prerenders to be appended after regular Lambdas.
  // Without that ordering, shared references can be reconstructed incorrectly.
  const prerenders = new Map<string, Prerender>();
  let meta: DeserializeBuildOutputMeta | undefined;

  const functionsDir = join(outputDir, 'functions');
  const functionSymlinks = new Map<string, string>();

  for await (const path of createFunctionsIterator(functionsDir)) {
    let lambda: TLambda | undefined;
    const fnDir = join(functionsDir, `${path}.func`);

    try {
      const link = await fs.readlink(fnDir);
      const target = join(dirname(path), link).slice(0, -5);
      functionSymlinks.set(path, target);
    } catch (error: unknown) {
      if (getErrorCode(error) !== 'EINVAL') {
        throw error;
      }

      const funcConfigPath = join(fnDir, '.vc-config.json');
      const funcConfig = await maybeReadJSON<
        SerializedEdgeFunction | SerializedLambda | SerializedNodejsLambda
      >(funcConfigPath);

      if (!funcConfig) {
        throw new Error(`Could not load function config: "${funcConfigPath}"`);
      }

      const files = await glob('**', { cwd: fnDir, includeDirectories: true });
      delete files['.vc-config.json'];

      if (funcConfig.type === 'EdgeFunction' || funcConfig.runtime === 'edge') {
        output[path] = await deserializeEdgeFunction({
          files,
          config: funcConfig as SerializedEdgeFunction,
          repoRootPath,
          fileFsRefsCache,
          createEdgeFunction,
        });
        continue;
      }

      lambda = await deserializeLambda({
        files,
        config: funcConfig,
        repoRootPath,
        fileFsRefsCache,
        useOnlyStreamingLambda,
        forceNodejsStreaming,
        createLambda,
        createNodejsLambda,
      });

      const lambdaMeta = await inspectLambda?.({
        path,
        config: funcConfig,
        lambda,
        repoRootPath,
      });
      if (lambdaMeta) {
        meta = {
          ...meta,
          ...lambdaMeta,
        };
      }
    }

    const prerenderConfigPath = join(
      functionsDir,
      `${path}.prerender-config.json`
    );
    const prerenderConfig =
      await maybeReadJSON<SerializedPrerender>(prerenderConfigPath);
    if (prerenderConfig) {
      const fallback = await deserializePrerenderFallback(
        prerenderConfigPath,
        prerenderConfig.fallback
      );

      prerenders.set(
        path,
        new Prerender({
          ...prerenderConfig,
          lambda,
          fallback,
        })
      );
    } else if (lambda) {
      output[path] = lambda;
    }
  }

  applyFunctionSymlinks(output, prerenders, functionSymlinks);
  appendSortedPrerenders(output, prerenders);

  const groupedLambdas = await (groupLambdas ?? defaultGroupLambdas)({
    lambdas: getBundleableLambdas(output),
    maxBundleSizeMb,
    debug: debugGroupLambdas,
  });
  applyGroupedLambdas(output, groupedLambdas);

  return {
    config,
    flags,
    output,
    framework: validateFrameworkVersion(config.framework?.version),
    meta,
  };
}
