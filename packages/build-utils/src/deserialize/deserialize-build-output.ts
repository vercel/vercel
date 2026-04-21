import * as fs from 'fs-extra';
import { dirname, join } from 'path';
import type { EdgeFunction } from '../edge-function';
import { NowBuildError } from '../errors';
import FileFsRef from '../file-fs-ref';
import glob from '../fs/glob';
import type { Lambda } from '../lambda';
import { Prerender } from '../prerender';
import type { BuildResultV2Typical } from '../types';
import { createFunctionsIterator } from './create-functions-iterator';
import { deserializeEdgeFunction } from './deserialize-edge-function';
import type {
  DeserializeBuildOutputConfig,
  DeserializeBuildOutputFiles,
  DeserializeBuildOutputOptions,
  DeserializeBuildOutputResult,
  DeserializeBuildOutputSerializedConfig,
  DeserializeBuildOutputSerializedPrerender,
  DeserializeBuildOutputPathOverride,
} from './deserialize-build-output-types';
import { maybeReadJSON } from './maybe-read-json';
import { validateFrameworkVersion } from './validate-framework-version';

const MAX_DEPLOYMENT_ID_LENGTH = 32;
const VALID_DEPLOYMENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function validateDeploymentId(deploymentId?: string): void {
  if (deploymentId && deploymentId.length > MAX_DEPLOYMENT_ID_LENGTH) {
    throw new NowBuildError({
      message: `The configured deploymentId "${deploymentId}" exceeds the maximum length of ${MAX_DEPLOYMENT_ID_LENGTH} characters. Please use a shorter deploymentId.`,
      code: 'VC_BUILD_INVALID_DEPLOYMENT_ID_LENGTH',
    });
  }

  if (deploymentId && !VALID_DEPLOYMENT_ID_PATTERN.test(deploymentId)) {
    throw new NowBuildError({
      message: `The configured deploymentId "${deploymentId}" contains invalid characters. Only alphanumeric characters (a-z, A-Z, 0-9), hyphens (-), and underscores (_) are allowed.`,
      code: 'VC_BUILD_INVALID_DEPLOYMENT_ID_CHARACTERS',
    });
  }
}

function applyOutputOverrides(
  output: DeserializeBuildOutputFiles,
  overrides: Record<string, DeserializeBuildOutputPathOverride> | undefined,
  warn?: (message: string) => void
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
      warn?.(
        `Warning: Override path "${name}" was not detected as an output path`
      );
    }
  }
}

async function deserializePrerenderFallback(
  prerenderConfigPath: string,
  fallbackConfig: DeserializeBuildOutputSerializedPrerender['fallback']
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
  output: DeserializeBuildOutputFiles,
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

    // TODO: Revert to `output[path]`. This is part of temporary
    // code to put `Prerenders` at the end of "output" object.
    // const srcOutput = output[path];
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
  output: DeserializeBuildOutputFiles,
  prerenders: Map<string, Prerender>
): void {
  const sortedPrerenders = Array.from(prerenders.entries())
    .sort((a, b) => {
      return (a[1].group ?? 0) - (b[1].group ?? 0);
    })
    .reduce<Record<string, Prerender>>((o, [path, prerender]) => {
      o[path] = prerender;
      return o;
    }, {});

  // TODO: Remove. This is part of temporary code to put `Prerenders`
  // at the end of "output" object. See note above.
  Object.assign(output, sortedPrerenders);
}

function getBundleableLambdas<TLambda extends Lambda>(
  output: DeserializeBuildOutputFiles
): Record<string, TLambda> {
  const bundleableLambdas: Record<string, TLambda> = {};

  for (const [outputName, curOutput] of Object.entries(output)) {
    if (curOutput.type === 'Lambda' && curOutput.experimentalAllowBundling) {
      bundleableLambdas[outputName] = curOutput as TLambda;
    } else if (
      curOutput.type === 'Prerender' &&
      curOutput.lambda &&
      curOutput.lambda.experimentalAllowBundling
    ) {
      bundleableLambdas[outputName] = curOutput.lambda as TLambda;
    }
  }

  return bundleableLambdas;
}

function applyGroupedLambdas<TLambda extends Lambda>(
  output: DeserializeBuildOutputFiles,
  groupedLambdas: Record<string, TLambda>
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

export async function deserializeBuildOutput<
  TConfig extends DeserializeBuildOutputConfig = DeserializeBuildOutputConfig,
  TResult extends DeserializeBuildOutputResult = DeserializeBuildOutputResult,
  TLambda extends Lambda = Lambda,
>(options: DeserializeBuildOutputOptions<TResult, TLambda>): Promise<TResult> {
  const {
    outputDir,
    repoRootPath,
    maxBundleSizeMb,
    debugGroupLambdas,
    useOnlyStreamingLambda,
    forceNodejsStreaming,
    deserializeLambda,
    groupLambdas,
    inspectSerializedLambda,
    warn,
    includeDeploymentId,
    getMeta,
  } = options;
  let hasServerActions = false;
  const configPath = join(outputDir, 'config.json');
  const config = await maybeReadJSON<TConfig>(configPath);

  if (!config) {
    throw new Error(`Config file was not found at "${configPath}"`);
  }

  if (config.version !== 3) {
    throw new Error(
      `Expected \`version: 3\` in "${configPath}" file (received \`${config.version}\`)`
    );
  }

  validateDeploymentId(config.deploymentId);

  const flags = await maybeReadJSON<TResult['flags']>(
    join(outputDir, 'flags.json')
  );

  const staticDir = join(outputDir, 'static');
  const output: BuildResultV2Typical['output'] = await glob('**', {
    cwd: staticDir,
    follow: true,
  });

  applyOutputOverrides(output, config.overrides, warn);

  const fileFsRefsCache = new Map<string, FileFsRef>();

  // Note: There is a bug in existing callers which requires Prerenders
  // to come *after* regular Lambdas in the `output` object, otherwise
  // Lambdas that share a reference to a Prerender will be treated like
  // a Prerender.
  // This is a temporary hack to ensure prerenders are placed at the end
  // of the `output` object to work around that issue, until it's fixed
  // more properly in existing callers.
  const prerenders = new Map<string, Prerender>();

  const functionsDir = join(outputDir, 'functions');
  const functionSymlinks: Map<string, string> = new Map();
  for await (const path of createFunctionsIterator(functionsDir)) {
    let lambda: TLambda | undefined = undefined;
    const fnDir = join(functionsDir, `${path}.func`);

    try {
      const link = await fs.readlink(fnDir);
      const target = join(dirname(path), link).slice(0, -5);
      functionSymlinks.set(path, target);
    } catch (err: any) {
      if (err.code !== 'EINVAL') throw err;

      const funcConfigPath = join(fnDir, '.vc-config.json');
      const funcConfig =
        await maybeReadJSON<DeserializeBuildOutputSerializedConfig>(
          funcConfigPath
        );

      if (!funcConfig) {
        throw new Error(`Could not load function config: "${funcConfigPath}"`);
      }

      const files = await glob('**', { cwd: fnDir, includeDirectories: true });
      delete files['.vc-config.json'];

      if (funcConfig.type === 'EdgeFunction' || funcConfig.runtime === 'edge') {
        output[path] = await deserializeEdgeFunction(
          files,
          funcConfig as DeserializeBuildOutputSerializedConfig & {
            type: 'EdgeFunction';
          },
          repoRootPath,
          fileFsRefsCache
        );
        continue;
      }

      lambda = await deserializeLambda(
        files,
        funcConfig,
        repoRootPath,
        fileFsRefsCache,
        { useOnlyStreamingLambda, forceNodejsStreaming }
      );

      if (inspectSerializedLambda) {
        hasServerActions = await inspectSerializedLambda(
          path,
          funcConfig,
          repoRootPath,
          hasServerActions
        );
      }
    }

    const prerenderConfigPath = join(
      functionsDir,
      `${path}.prerender-config.json`
    );
    const prerenderConfig =
      await maybeReadJSON<DeserializeBuildOutputSerializedPrerender>(
        prerenderConfigPath
      );
    if (prerenderConfig) {
      const fallback = await deserializePrerenderFallback(
        prerenderConfigPath,
        prerenderConfig.fallback
      );

      const prerender = new Prerender({
        ...prerenderConfig,
        lambda,
        fallback,
      });

      prerenders.set(path, prerender);
    } else if (lambda) {
      output[path] = lambda;
    }
  }

  applyFunctionSymlinks(output, prerenders, functionSymlinks);
  appendSortedPrerenders(output, prerenders);

  const groupedLambdas = await groupLambdas(
    getBundleableLambdas<TLambda>(output),
    {
      force: undefined,
      maxBundleSizeMb,
      debug: debugGroupLambdas,
    }
  );
  applyGroupedLambdas(output, groupedLambdas);

  const framework = validateFrameworkVersion(config?.framework?.version);
  const meta = getMeta?.(hasServerActions);
  return {
    wildcard: config.wildcard,
    images: config.images,
    crons: config.crons,
    flags: flags ? flags : config.flags,
    routes: config.routes,
    output,
    framework,
    ...(includeDeploymentId ? { deploymentId: config.deploymentId } : {}),
    ...(meta !== undefined ? { meta } : {}),
  } as TResult;
}
