import bytes from 'bytes';
import chalk from 'chalk';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { createFunction } from '@zeit/fun';
import { readFile, mkdirp } from 'fs-extra';
import ignore, { Ignore } from '@zeit/dockerignore';
import { FileFsRef, download } from '@now/build-utils';

import { globBuilderInputs } from './glob';
import DevServer from './dev-server';
import wait from '../../../util/output/wait';
import IGNORED from '../../../util/ignored';
import { LambdaSizeExceededError } from '../../../util/errors-ts';
import { installBuilders, getBuilder } from './builder-cache';
import {
  PACKAGE,
  NowConfig,
  BuildConfig,
  BuildSubscription,
  BuilderParamsBase,
  BuilderInputs,
  BuilderOutput,
  BuilderOutputs,
  BuiltLambda,
  CacheOutputs,
  PrepareCacheParams
} from './types';

const tmpDir = tmpdir();
const getWorkPath = () =>
  join(
    tmpDir,
    'co.zeit.now',
    'dev',
    'workPaths',
    Math.random()
      .toString(32)
      .slice(-8)
  );

/**
 * Build project to statics & lambdas
 */
export async function executeInitialBuilds(
  nowJson: NowConfig,
  devServer: DevServer
): Promise<void> {
  try {
    devServer.setStatusBusy('Installing builders');
    const builds = nowJson.builds || [];
    await installBuilders(builds.map(build => build.use));

    devServer.setStatusBusy('Building lambdas');
    await executeBuilds(nowJson, devServer);

    devServer.setStatusIdle();
  } catch (err) {
    devServer.setStatusIdle();
    throw err;
  }
}

export async function executePrepareCache(
  devServer: DevServer,
  buildConfig: BuildConfig,
  params: PrepareCacheParams
): Promise<CacheOutputs> {
  const { builder } = buildConfig;
  if (!builder) {
    throw new Error('No builder');
  }
  if (!builder.prepareCache) {
    throw new Error('Builder has no `prepareCache()` function');
  }

  // Since the `prepareCache()` function may be computationally expensive, and
  // its run in the same process as `now dev` (for now), defer executing it
  // until after there has been time for the current HTTP request to complete.
  await new Promise(r => setTimeout(r, 3000));

  const startTime = Date.now();
  const results = await builder.prepareCache(params);
  const cacheTime = Date.now() - startTime;
  devServer.output.debug(`\`prepareCache()\` took ${cacheTime}ms`);
  return results;
}

export async function executeBuild(
  nowJson: NowConfig,
  devServer: DevServer,
  asset: BuilderOutput | BuildSubscription,
  requestPath: string | null = null
): Promise<void> {
  const { buildConfig, buildEntry } = asset;
  if (!buildConfig || !buildEntry) {
    throw new Error("Asset has not been built yet, can't rebuild");
  }
  const { cwd, env } = devServer;
  const entrypoint = relative(cwd, buildEntry.fsPath);

  const workPath = getWorkPath();
  await mkdirp(workPath);

  if (buildConfig.builderCachePromise) {
    devServer.output.debug('Restoring build cache from previous build');
    const builderCache = await buildConfig.builderCachePromise;
    const startTime = Date.now();
    await download(builderCache, workPath);
    const cacheRestoreTime = Date.now() - startTime;
    devServer.output.debug(`Restoring build cache took ${cacheRestoreTime}ms`);
  }

  const { builder } = buildConfig;
  if (!builder) {
    throw new Error('No builder');
  }
  devServer.output.debug(
    `Building ${buildEntry.fsPath} with "${buildConfig.use}" v${
      builder[PACKAGE]!.version
    } (workPath = ${workPath})`
  );
  const builderConfig = builder.config || {};
  const files = await collectProjectFiles('**', cwd);
  const config = buildConfig.config || {};
  let output: BuilderOutputs;
  try {
    devServer.applyBuildEnv(nowJson);
    output = await builder.build({
      files,
      entrypoint,
      workPath,
      config,
      meta: { isDev: true, requestPath }
    });

    if (typeof builder.prepareCache === 'function') {
      const cachePath = getWorkPath();
      await mkdirp(cachePath);
      buildConfig.builderCachePromise = executePrepareCache(
        devServer,
        buildConfig,
        {
          files,
          entrypoint,
          workPath,
          cachePath,
          config,
          meta: { isDev: true, requestPath }
        }
      );
    }
  } finally {
    devServer.restoreOriginalEnv();
  }

  // enforce the lambda zip size soft watermark
  const { maxLambdaSize = '5mb' } = { ...builderConfig, ...config };
  let maxLambdaBytes: number;
  if (typeof maxLambdaSize === 'string') {
    maxLambdaBytes = bytes(maxLambdaSize);
  } else {
    maxLambdaBytes = maxLambdaSize;
  }

  for (const asset of Object.values(output)) {
    if (asset.type === 'Lambda') {
      const size = asset.zipBuffer.length;
      if (size > maxLambdaBytes) {
        throw new LambdaSizeExceededError(size, maxLambdaBytes);
      }
    }

    asset.buildConfig = buildConfig;
    asset.buildEntry = buildEntry;
  }

  await Promise.all(
    Object.entries(output).map(async entry => {
      const path: string = entry[0];
      const asset: BuilderOutput = entry[1];

      if (asset.type === 'Lambda') {
        // Tear down the previous `fun` Lambda instance for this asset
        const oldAsset = devServer.assets[path];
        if (oldAsset && oldAsset.type === 'Lambda' && oldAsset.fn) {
          await oldAsset.fn.destroy();
        }

        asset.fn = await createFunction({
          Code: { ZipFile: asset.zipBuffer },
          Handler: asset.handler,
          Runtime: asset.runtime,
          MemorySize: 3008,
          Environment: {
            Variables: {
              ...nowJson.env,
              ...asset.environment,
              ...env,
              NOW_REGION: 'dev1'
            }
          }
        });
      }

      asset.buildTimestamp = Date.now();
    })
  );

  // TODO: remove previous assets, i.e. if the rebuild has different outputs that
  // don't include some of the previous ones. For example, deleting a page in
  // a Next.js build
  Object.assign(devServer.assets, output);
}

async function executeBuilds(
  nowJson: NowConfig,
  devServer: DevServer
): Promise<void> {
  if (!nowJson.builds) {
    return;
  }

  const { cwd, env } = devServer;
  const files = await collectProjectFiles('**', cwd);

  for (const build of nowJson.builds) {
    try {
      devServer.output.debug(`Build ${JSON.stringify(build)}`);
      const builder = await getBuilder(build.use);
      build.builder = builder;

      let { src } = build;
      if (src[0] === '/') {
        // Remove a leading slash so that the globbing is relative to `cwd`
        // instead of the root of the filesystem. This matches the behavior
        // of Now deployments.
        src = src.substring(1);
      }
      const entries = Object.values(await collectProjectFiles(src, cwd));

      for (const entry of entries) {
        const config = build.config || {};
        const entrypoint = relative(cwd, entry.fsPath);

        const workPath = getWorkPath();
        await mkdirp(workPath);

        let output: BuilderOutputs;
        try {
          devServer.applyBuildEnv(nowJson);
          const buildConfig: BuilderParamsBase = {
            files,
            entrypoint,
            config,
            meta: { isDev: true, requestPath: null }
          };
          if (typeof builder.subscribe === 'function') {
            // If the builder has a `subscribe()` function, then the initial
            // builds are not run and instead an array of "subscriptions" is
            // created. When an HTTP request comes in that matches one of the
            // subscription patterns, then this builder will be actually be
            // executed.
            devServer.output.debug(`Getting subscriptions for ${entry.fsPath}`);
            const subscription = await builder.subscribe(buildConfig);
            devServer.subscriptions.push({
              type: 'Subscription',
              patterns: subscription,
              buildConfig: build,
              buildEntry: entry,
              buildTimestamp: Date.now()
            });
            continue;
          } else {
            devServer.output.debug(
              `Building ${entry.fsPath} with "${build.use}" v${
                builder[PACKAGE]!.version
              } (workPath = ${workPath})`
            );
            output = await builder.build({ ...buildConfig, workPath });

            if (typeof builder.prepareCache === 'function') {
              const cachePath = getWorkPath();
              await mkdirp(cachePath);
              build.builderCachePromise = executePrepareCache(
                devServer,
                build,
                {
                  files,
                  entrypoint,
                  workPath,
                  cachePath,
                  config,
                  meta: { isDev: true, requestPath: null }
                }
              );
            }
          }
        } finally {
          devServer.restoreOriginalEnv();
        }

        // enforce the lambda zip size soft watermark
        const builderConfig = builder.config || {};
        const { maxLambdaSize = '5mb' } = { ...builderConfig, ...config };
        let maxLambdaBytes: number;
        if (typeof maxLambdaSize === 'string') {
          maxLambdaBytes = bytes(maxLambdaSize);
        } else {
          maxLambdaBytes = maxLambdaSize;
        }

        for (const asset of Object.values(output)) {
          if (asset.type === 'Lambda') {
            const size = asset.zipBuffer.length;
            if (size > maxLambdaBytes) {
              throw new LambdaSizeExceededError(size, maxLambdaBytes);
            }
          }

          asset.buildConfig = build;
          asset.buildEntry = entry;
        }

        Object.assign(devServer.assets, output);
      }
    } catch (err) {
      throw err;
    }
  }

  await Promise.all(
    Object.values(devServer.assets).map(async (asset: BuilderOutput) => {
      if (asset.type === 'Lambda') {
        asset.fn = await createFunction({
          Code: { ZipFile: asset.zipBuffer },
          Handler: asset.handler,
          Runtime: asset.runtime,
          MemorySize: 3008,
          Environment: {
            Variables: {
              ...nowJson.env,
              ...asset.environment,
              ...env,
              NOW_REGION: 'dev1'
            }
          }
        });
      }

      asset.buildTimestamp = Date.now();
    })
  );
}

/**
 * Collect project files, with `.nowignore` honored.
 */
export async function collectProjectFiles(
  pattern: string,
  cwd: string
): Promise<BuilderInputs> {
  const ignore = await createIgnoreList(cwd);
  const files = await globBuilderInputs(pattern, { cwd, ignore });
  return files;
}

/**
 * Create ignore list according `.nowignore` in cwd.
 */
export async function createIgnoreList(cwd: string): Promise<Ignore> {
  const ig = ignore();

  // Add the default ignored files
  ig.add(IGNORED);

  // Special case for now-cli's usage
  ig.add('.nowignore');

  try {
    const nowignore = join(cwd, '.nowignore');
    ig.add(await readFile(nowignore, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  return ig;
}
