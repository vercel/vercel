import {
  getLambdaOptionsFromFunction,
  type Builder,
  type Config,
  type DevFunction,
  type DevManifest,
  type Env,
  type Schedule,
  getNamedSchedules,
} from '@vercel/build-utils';
import { posix } from 'path';
import minimatch from 'minimatch';
import { importBuilders } from '../../builders/import-builders';
import type { FunctionQueueSubscription } from './queue-broker';
import { dev } from './diagnostics';
import { validateConfig } from '../validate-config';

export interface DevFunctionScope {
  build: Builder;
  target: 'framework' | 'builder';
}

export interface RegisteredDevFunction extends DevFunction {
  scope: DevFunctionScope;
}

export interface DevFunctionRegistry {
  functions: Map<string, RegisteredDevFunction>;
  schedules: Schedule[];
  unmatchedPatterns: string[];
}

function validPath(value: unknown, http = false): value is string {
  if (typeof value !== 'string' || !value) return false;
  try {
    const pathname = http ? value : `/${value}`;
    const decoded = decodeURIComponent(pathname);
    return (
      pathname.startsWith('/') &&
      !pathname.startsWith('//') &&
      !/[\\?#\s]/.test(pathname) &&
      new URL(pathname, 'http://localhost').pathname === pathname &&
      !/[\\?#\x00-\x1f\x7f]/.test(decoded) &&
      !/%2f/i.test(pathname) &&
      !decoded
        .split('/')
        .some(segment => segment === '.' || segment === '..') &&
      (http || (!value.endsWith('/') && !value.includes('//')))
    );
  } catch {
    return false;
  }
}

export async function collectDevFunctions({
  scopes,
  workPath,
  files,
  config,
  env,
}: {
  scopes: DevFunctionScope[];
  workPath: string;
  files: string[];
  config: Config;
  env: Env;
}): Promise<DevFunctionRegistry> {
  const builders = await importBuilders(
    new Set(scopes.map(({ build }) => build.use)),
    workPath
  );
  const unmatched = new Set(
    Object.entries(config.functions ?? {})
      .filter(([, fn]) =>
        fn.experimentalTriggers?.some(
          trigger => trigger.type === 'queue/v2beta'
        )
      )
      .map(([pattern]) => pattern)
  );
  const functions = new Map<string, RegisteredDevFunction>();
  const schedules: DevFunctionRegistry['schedules'] = [];
  for (const scope of scopes) {
    const { build, target } = scope;
    const builder = builders.get(build.use)?.builder;
    if (!builder) throw dev.DEV_BUILDER_LOAD_FAILED({ use: build.use });
    const scopedConfig = structuredClone({
      ...config,
      ...build.config,
      // Detection omits functions when no authored patterns belong to this build.
      functions:
        build.config?.functions ??
        (build.config?.zeroConfig ? {} : config.functions),
    });
    let manifest: DevManifest;
    const { scheduleFunction } = build.config ?? {};
    if (scheduleFunction && build.src) {
      // The CLI planned this function from `schedules`, like `vercel build`
      // does. The builder only builds it, so its identity is known here.
      manifest = {
        functions: [
          {
            outputPath: scheduleFunction.outputPath,
            sourceFile: build.src,
            invocation: { type: 'entrypoint', entrypoint: build.src },
            experimentalTriggers: [{ type: 'schedule/v1beta' }],
          },
        ],
        matchedFunctionPatterns: [],
      };
    } else if (builder.getDevManifest) {
      manifest = await builder.getDevManifest({
        workPath,
        build,
        files,
        config: scopedConfig,
        env,
      });
    } else {
      manifest = { functions: [], matchedFunctionPatterns: [] };
      const mode = build.config ?? {};
      // Only scalar, source-backed entrypoints have a conventional identity.
      // VX is bounded to the classic zero-config api directory convention.
      if (
        target !== 'builder' ||
        mode.framework ||
        mode.middleware ||
        mode.buildType === 'middleware' ||
        mode.buildType === 'app' ||
        mode.serviceName ||
        mode.serviceType ||
        mode.buildpack ||
        !build.src ||
        build.src.includes('<')
      )
        continue;
      const pattern = build.src.replace(/^\//, '');
      for (const sourceFile of files) {
        if (
          !(
            sourceFile === pattern ||
            minimatch(sourceFile, pattern, { dot: true })
          ) ||
          (builder.version !== 3 &&
            !(
              builder.version === -1 &&
              mode.zeroConfig &&
              pattern.startsWith('api/') &&
              sourceFile.startsWith('api/')
            )) ||
          /(^|\/)package\.json$/.test(sourceFile) ||
          /^(?:src\/)?middleware\.[^/]+$/.test(sourceFile)
        )
          continue;
        const extension = posix.extname(sourceFile);
        const outputPath =
          mode.zeroConfig && extension
            ? sourceFile.slice(0, -extension.length)
            : sourceFile;
        const { experimentalTriggers } = await getLambdaOptionsFromFunction({
          sourceFile,
          config: scopedConfig,
        });
        manifest.functions.push({
          outputPath,
          sourceFile,
          invocation: { type: 'entrypoint', entrypoint: sourceFile },
          experimentalTriggers,
        });
        const matched = Object.keys(scopedConfig.functions ?? {}).find(
          key => sourceFile === key || minimatch(sourceFile, key)
        );
        if (matched) manifest.matchedFunctionPatterns.push(matched);
      }
    }
    if (
      !Array.isArray(manifest?.functions) ||
      !Array.isArray(manifest?.matchedFunctionPatterns) ||
      manifest.matchedFunctionPatterns.some(
        pattern => typeof pattern !== 'string'
      )
    )
      throw dev.DEV_FUNCTION_MANIFEST_INVALID({ use: build.use });
    const scheduleError = validateConfig({ schedules: manifest.schedules });
    if (scheduleError) throw scheduleError;
    for (const fn of manifest.functions) {
      if (
        !validPath(fn?.outputPath) ||
        fn.outputPath.endsWith('.func') ||
        (fn.sourceFile !== undefined && !validPath(fn.sourceFile)) ||
        !fn.invocation ||
        (fn.invocation.type === 'http'
          ? !validPath(fn.invocation.pathname, true)
          : fn.invocation.type !== 'entrypoint' ||
            !validPath(fn.invocation.entrypoint)) ||
        (fn.experimentalTriggers !== undefined &&
          !Array.isArray(fn.experimentalTriggers))
      )
        throw dev.DEV_FUNCTION_MANIFEST_INVALID({ use: build.use });
      if (functions.has(fn.outputPath)) {
        throw dev.DEV_FUNCTION_OUTPUT_DUPLICATE({ outputPath: fn.outputPath });
      }
      functions.set(fn.outputPath, {
        outputPath: fn.outputPath,
        sourceFile: fn.sourceFile,
        invocation: structuredClone(fn.invocation),
        experimentalTriggers: structuredClone(fn.experimentalTriggers),
        scope,
      });
    }
    schedules.push(...getNamedSchedules(structuredClone(manifest.schedules)));
    for (const pattern of manifest.matchedFunctionPatterns)
      unmatched.delete(pattern);
  }
  return { functions, schedules, unmatchedPatterns: [...unmatched] };
}

export function deriveQueueSubscriptions(
  registry: DevFunctionRegistry
): FunctionQueueSubscription[] {
  const subscriptions: FunctionQueueSubscription[] = [];
  const ids = new Set<string>();
  for (const fn of registry.functions.values()) {
    for (const trigger of fn.experimentalTriggers ?? []) {
      if (!trigger || typeof trigger.type !== 'string') {
        throw dev.DEV_FUNCTION_MANIFEST_INVALID({ use: fn.scope.build.use });
      }
      if (trigger.type !== 'queue/v2beta') continue;
      const {
        consumer,
        topic,
        retryAfterSeconds,
        initialDelaySeconds,
        maxDeliveries,
      } = trigger;
      if (
        typeof consumer !== 'string' ||
        !consumer ||
        typeof topic !== 'string' ||
        !topic ||
        [retryAfterSeconds, initialDelaySeconds, maxDeliveries].some(
          value => value !== undefined && (!Number.isFinite(value) || value < 0)
        ) ||
        (retryAfterSeconds !== undefined && retryAfterSeconds <= 0) ||
        (maxDeliveries !== undefined &&
          (!Number.isInteger(maxDeliveries) || maxDeliveries < 1))
      )
        throw dev.DEV_FUNCTION_MANIFEST_INVALID({ use: fn.scope.build.use });
      const id = `${consumer}::${topic}`;
      if (ids.has(id))
        throw dev.DEV_QUEUE_CONSUMER_DUPLICATE({
          consumerGroup: consumer,
          topic,
        });
      ids.add(id);
      subscriptions.push({
        outputPath: fn.outputPath,
        consumer,
        topic,
        retryAfterSeconds,
        initialDelaySeconds,
        maxDeliveries,
      });
    }
  }
  return subscriptions;
}
