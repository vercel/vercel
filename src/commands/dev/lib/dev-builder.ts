/* disable this rule _here_ to avoid conflict with ongoing changes */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
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
  files: BuilderInputs,
  match: BuildMatch,
  requestPath: string | null = null,
  filesChanged?: string[],
  filesRemoved?: string[]
): Promise<void> {
  const {
    builderWithPkg: { builder, package: pkg }
  } = match;
  const { cwd, env } = devServer;
  const entrypoint = match.src;

  const workPath = getWorkPath();
  await mkdirp(workPath);

  if (match.builderCachePromise) {
    devServer.output.debug('Restoring build cache from previous build');
    const builderCache = await match.builderCachePromise;
    const startTime = Date.now();
    await download(builderCache, workPath);
    const cacheRestoreTime = Date.now() - startTime;
    devServer.output.debug(`Restoring build cache took ${cacheRestoreTime}ms`);
  }

  devServer.output.debug(
    `Building ${entrypoint} with "${match.use}"${
      pkg.version ? ` v${pkg.version}` : ''
    } (workPath = ${workPath})`
  );
  const builderConfig = builder.config || {};
  const config = match.config || {};
  let outputs: BuilderOutputs;
  let result: BuildResult;
  try {
    devServer.applyBuildEnv(nowJson);
    const r = await builder.build({
      files,
      entrypoint,
      workPath,
      config,
      meta: { isDev: true, requestPath, filesChanged, filesRemoved }
    });
    if (r.output) {
      result = r as BuildResult;
    } else {
      // `BuilderOutputs` map was returned (Now Builder v1 behavior)
      result = { output: r as BuilderOutputs };
    }
    outputs = result.output;

    if (typeof builder.prepareCache === 'function') {
      const cachePath = getWorkPath();
      await mkdirp(cachePath);
      match.builderCachePromise = executePrepareCache(devServer, match, {
        files,
        entrypoint,
        workPath,
        cachePath,
        config,
        meta: { isDev: true, requestPath }
      });
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
  }

  await Promise.all(
    Object.entries(outputs).map(async entry => {
      const path: string = entry[0];
      const asset: BuilderOutput = entry[1];

      if (asset.type === 'Lambda') {
        // Tear down the previous `fun` Lambda instance for this asset
        const oldAsset = match.buildOutput && match.buildOutput[path];
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

      match.buildTimestamp = Date.now();
    })
  );

  match.buildResults.set(requestPath, result);
  Object.assign(match.buildOutput, outputs);
}

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

    // TODO: use the `files` map from DevServer instead of hitting the filesystem
    const entries = Object.values(await collectProjectFiles(src, cwd));

    for (const fileRef of entries) {
      src = relative(cwd, fileRef.fsPath);
      const builderWithPkg = await getBuilder(use);
      matches.push({
        ...buildConfig,
        src,
        builderWithPkg,
        buildOutput: {},
        buildResults: new Map(),
        buildTimestamp: 0
      });
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
