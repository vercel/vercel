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
  NowConfig,
  BuildConfig,
  BuildMatch,
  BuildResult,
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
/*
export async function executeInitialBuilds(
  nowJson: NowConfig,
  devServer: DevServer
): Promise<void> {
  const builds = nowJson.builds || [];
  await installBuilders(builds.map(build => build.use));

  devServer.setStatusBusy('Building lambdas');
  await executeBuilds(nowJson, devServer);
}

export async function executePrepareCache(
  devServer: DevServer,
  buildMatch: BuildMatch,
  params: PrepareCacheParams
): Promise<CacheOutputs> {
  const { builderWithPkg } = buildMatch;
  if (!builderWithPkg) {
    throw new Error('No builder');
  }
  const { builder } = builderWithPkg;
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
  asset: BuilderOutput,
  requestPath: string | null = null
): Promise<void> {
  const { buildMatch, buildEntry } = asset;
  if (!buildMatch || !buildEntry) {
    throw new Error("Asset has not been built yet, can't rebuild");
  }
  const { cwd, env } = devServer;
  const entrypoint = relative(cwd, buildEntry.fsPath);

  const workPath = getWorkPath();
  await mkdirp(workPath);

  if (buildMatch.builderCachePromise) {
    devServer.output.debug('Restoring build cache from previous build');
    const builderCache = await buildMatch.builderCachePromise;
    const startTime = Date.now();
    await download(builderCache, workPath);
    const cacheRestoreTime = Date.now() - startTime;
    devServer.output.debug(`Restoring build cache took ${cacheRestoreTime}ms`);
  }

  const { builderWithPkg } = buildMatch;
  if (!builderWithPkg) {
    throw new Error('No builder');
  }
  const { builder, package: pkg } = builderWithPkg;
  devServer.output.debug(
    `Building ${buildEntry.fsPath} with "${buildMatch.use}" v${
      pkg.version
    } (workPath = ${workPath})`
  );
  const builderConfig = builder.config || {};
  const files = await collectProjectFiles('**', cwd);
  const config = buildMatch.config || {};
  let outputs: BuilderOutputs;
  try {
    devServer.applyBuildEnv(nowJson);
    if (builder.version === 2) {
    } else {
      outputs = await builder.build({
        files,
        entrypoint,
        workPath,
        config,
        meta: { isDev: true, requestPath }
      });
    }

    if (typeof builder.prepareCache === 'function') {
      const cachePath = getWorkPath();
      await mkdirp(cachePath);
      buildMatch.builderCachePromise = executePrepareCache(
        devServer,
        buildMatch,
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

  for (const asset of Object.values(outputs)) {
    if (asset.type === 'Lambda') {
      const size = asset.zipBuffer.length;
      if (size > maxLambdaBytes) {
        throw new LambdaSizeExceededError(size, maxLambdaBytes);
      }
    }

    asset.buildMatch = buildMatch;
    asset.buildEntry = buildEntry;
  }

  await Promise.all(
    Object.entries(outputs).map(async entry => {
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
  Object.assign(devServer.assets, outputs);
}

async function executeBuilds(
  nowJson: NowConfig,
  devServer: DevServer
): Promise<void> {
  if (!nowJson.builds) {
    return;
  }

  const { cwd, env, output } = devServer;
  const files = await collectProjectFiles('**', cwd);

  for (const buildConfig of nowJson.builds) {
    try {
      output.debug(`Build ${JSON.stringify(buildConfig)}`);
      const builderWithPkg = await getBuilder(buildConfig.use);
      const { builder, package: pkg } = builderWithPkg;

      let { src } = buildConfig;
      if (src[0] === '/') {
        // Remove a leading slash so that the globbing is relative to `cwd`
        // instead of the root of the filesystem. This matches the behavior
        // of Now deployments.
        src = src.substring(1);
      }
      const entries = Object.values(await collectProjectFiles(src, cwd));

      for (const buildEntry of entries) {
        const entrypoint = relative(cwd, buildEntry.fsPath);
        const buildMatch: BuildMatch = {
          ...buildConfig,
          src: entrypoint,
          builderWithPkg
        };
        const config = buildMatch.config || {};

        const workPath = getWorkPath();
        await mkdirp(workPath);

        let buildResult: BuildResult;
        let outputs: BuilderOutputs;
        try {
          devServer.applyBuildEnv(nowJson);
          const buildParams: BuilderParamsBase = {
            files,
            entrypoint,
            config,
            meta: { isDev: true, requestPath: null }
          };
          output.debug(
            `Building ${buildEntry.fsPath} with "${buildConfig.use}" v${
              pkg.version
            } (workPath = ${workPath})`
          );
          if (builder.version === 2) {
          } else {
            outputs = await builder.build({ ...buildMatch, workPath });
          }

          if (typeof builder.prepareCache === 'function') {
            const cachePath = getWorkPath();
            await mkdirp(cachePath);
            buildMatch.builderCachePromise = executePrepareCache(
              devServer,
              buildMatch,
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

        for (const asset of Object.values(outputs)) {
          if (asset.type === 'Lambda') {
            const size = asset.zipBuffer.length;
            if (size > maxLambdaBytes) {
              throw new LambdaSizeExceededError(size, maxLambdaBytes);
            }
          }

          asset.buildMatch = buildMatch;
          asset.buildEntry = buildEntry;
        }

        Object.assign(devServer.assets, outputs);
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
*/

export async function getBuildMatches(
  nowJson: NowConfig,
  cwd: string
): Promise<BuildMatch[]> {
  const matches: BuildMatch[] = [];
  const builds = nowJson.builds || [{ src: '**', use: '@now/static' }];
  for (const buildConfig of builds) {
    let { src, use } = buildConfig;
    if (src[0] === '/') {
      // Remove a leading slash so that the globbing is relative to `cwd`
      // instead of the root of the filesystem. This matches the behavior
      // of Now deployments.
      src = src.substring(1);
    }
    const entries = Object.values(await collectProjectFiles(src, cwd));

    for (const buildEntry of entries) {
      src = relative(cwd, buildEntry.fsPath);
      const builderWithPkg = await getBuilder(use);
      matches.push({ ...buildConfig, src, builderWithPkg });
    }
  }
  return matches;
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
