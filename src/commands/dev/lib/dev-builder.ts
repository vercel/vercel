/* disable this rule _here_ to avoid conflict with ongoing changes */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import bytes from 'bytes';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { createFunction } from '@zeit/fun';
import { readFile, mkdirp } from 'fs-extra';
import ignore, { Ignore } from '@zeit/dockerignore';
import { download } from '@now/build-utils';
import intercept from 'intercept-stdout';

import { globBuilderInputs } from './glob';
import DevServer from './dev-server';
import IGNORED from '../../../util/ignored';
import { LambdaSizeExceededError } from '../../../util/errors-ts';
import { getBuilder } from './builder-cache';
import {
  NowConfig,
  RouteConfig,
  BuildMatch,
  BuildResult,
  BuildResultV2,
  BuilderInputs,
  BuilderOutput,
  BuilderOutputs
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

export async function executeBuild(
  nowJson: NowConfig,
  devServer: DevServer,
  files: BuilderInputs,
  match: BuildMatch,
  requestPath: string,
  filesChanged?: string[],
  filesRemoved?: string[]
): Promise<void> {
  const {
    builderWithPkg: { builder, package: pkg }
  } = match;
  const { env } = devServer;
  const { src: entrypoint, workPath } = match;
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
  let result: BuildResult;

  try {
    devServer.applyBuildEnv(nowJson);
    let unhookIntercept;
    if (!devServer.debug) {
      unhookIntercept = intercept(() => '');
    }
    result = await builder.build({
      files,
      entrypoint,
      workPath,
      config,
      meta: { isDev: true, requestPath, filesChanged, filesRemoved }
    });
    if (typeof unhookIntercept === 'function') {
      unhookIntercept();
    }

    // Sort out build result to builder v2 shape
    if (builder.version === undefined) {
      // `BuilderOutputs` map was returned (Now Builder v1 behavior)
      result = {
        output: result as BuilderOutputs,
        routes: [],
        watch: []
      };
    }
  } finally {
    devServer.restoreOriginalEnv();
  }

  // Enforce the lambda zip size soft watermark
  const { maxLambdaSize = '5mb' } = { ...builderConfig, ...config };
  let maxLambdaBytes: number;
  if (typeof maxLambdaSize === 'string') {
    maxLambdaBytes = bytes(maxLambdaSize);
  } else {
    maxLambdaBytes = maxLambdaSize;
  }
  for (const asset of Object.values(result.output)) {
    if (asset.type === 'Lambda') {
      const size = asset.zipBuffer.length;
      if (size > maxLambdaBytes) {
        throw new LambdaSizeExceededError(size, maxLambdaBytes);
      }
    }
  }

  // Create function for all 'Lambda' type output
  await Promise.all(
    Object.entries(result.output).map(async entry => {
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
  Object.assign(match.buildOutput, result.output);
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
        buildTimestamp: 0,
        workPath: getWorkPath()
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

/**
  * Combine builder's output routes with Now Config's routes
  */
export async function combineRoutes (
  nowJson: NowConfig,
  devServer: DevServer,
  match: BuildMatch,
  requestPath: string,
): Promise<RouteConfig[]> {
  let routes: RouteConfig[] = nowJson.routes || [];
  const builds = nowJson.builds || [];

  await Promise.all(builds.map(async buildConfig => {
    const { builder } = await getBuilder(buildConfig.use);
    const { files } = devServer;

    if (builder.version === 2) {
      await executeBuild(
        nowJson,
        devServer,
        files,
        match,
        requestPath
      );
      const buildResult = match.buildResults.get(requestPath) as BuildResultV2;
      if (buildResult.routes) {
        routes = [...routes, ...buildResult.routes];
      }
    }
  }));

  return routes;
};
