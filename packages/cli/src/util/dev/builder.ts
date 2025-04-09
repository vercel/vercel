/* disable this rule _here_ to avoid conflict with ongoing changes */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import ms from 'ms';
import bytes from 'bytes';
import { delimiter, dirname, join } from 'path';
import { fork, type ChildProcess } from 'child_process';
import { createFunction } from '@vercel/fun';
import {
  type Builder,
  type BuildOptions,
  type Env,
  type File,
  Lambda,
  FileBlob,
  FileFsRef,
  normalizePath,
} from '@vercel/build-utils';
import { isStaticRuntime } from '@vercel/fs-detectors';
import plural from 'pluralize';
import minimatch from 'minimatch';

import highlight from '../output/highlight';
import { treeKill } from '../tree-kill';
import { relative } from '../path-helpers';
import { LambdaSizeExceededError } from '../errors-ts';

import type DevServer from './server';
import type {
  VercelConfig,
  BuildMatch,
  BuildResult,
  BuilderInputs,
  BuilderOutput,
  BuildResultV3,
  BuilderOutputs,
  EnvConfigs,
  BuiltLambda,
} from './types';
import { normalizeRoutes } from '@vercel/routing-utils';
import getUpdateCommand from '../get-update-command';
import { getTitleName } from '../pkg-name';
import { importBuilders } from '../build/import-builders';
import output from '../../output-manager';

interface BuildMessage {
  type: string;
}

interface BuildMessageResult extends BuildMessage {
  type: 'buildResult';
  result?: BuilderOutputs | BuildResult;
  error?: object;
}

async function createBuildProcess(
  match: BuildMatch,
  envConfigs: EnvConfigs,
  workPath: string
): Promise<ChildProcess> {
  output.debug(`Creating build process for "${match.entrypoint}"`);

  const builderWorkerPath = join(__dirname, 'builder-worker.js');

  // Ensure that `node` is in the builder's `PATH`
  const PATH = `${dirname(process.execPath)}${delimiter}${process.env.PATH}`;

  const env: Env = {
    ...process.env,
    PATH,
    ...envConfigs.allEnv,
  };

  const buildProcess = fork(builderWorkerPath, [], {
    cwd: workPath,
    execArgv: [],
    env,
  });
  match.buildProcess = buildProcess;

  buildProcess.on('close', (code, signal) => {
    output.debug(
      `Build process for "${match.entrypoint}" exited with ${signal || code}`
    );
    match.buildProcess = undefined;
  });

  return new Promise((resolve, reject) => {
    // The first message that the builder process sends is the `ready` event
    buildProcess.once('message', data => {
      if (
        data !== null &&
        typeof data === 'object' &&
        (data as { type: string }).type !== 'ready'
      ) {
        reject(new Error('Did not get "ready" event from builder'));
      } else {
        resolve(buildProcess);
      }
    });
  });
}

export async function executeBuild(
  vercelConfig: VercelConfig,
  devServer: DevServer,
  files: BuilderInputs,
  match: BuildMatch,
  requestPath: string | null,
  isInitialBuild: boolean,
  filesChanged?: string[],
  filesRemoved?: string[]
): Promise<void> {
  const {
    builderWithPkg: { path: requirePath, builder, pkg },
  } = match;
  const { entrypoint, use } = match;
  const isStatic = isStaticRuntime(use);
  const { envConfigs, cwd: workPath, devCacheDir } = devServer;
  const debug = output.isDebugEnabled();

  const startTime = Date.now();
  const showBuildTimestamp = !isStatic && (!isInitialBuild || debug);

  if (showBuildTimestamp) {
    output.log(`Building ${use}:${entrypoint}`);
    output.debug(
      `Using \`${pkg.name}${pkg.version ? `@${pkg.version}` : ''}\``
    );
  }

  const config = match.config || {};

  let result: BuildResult;

  let { buildProcess } = match;
  if (!isStatic && !buildProcess) {
    buildProcess = await createBuildProcess(match, envConfigs, workPath);
  }

  const buildOptions: BuildOptions = {
    files,
    entrypoint,
    workPath,
    repoRootPath: workPath,
    config,
    meta: {
      isDev: true,
      requestPath,
      devCacheDir,
      filesChanged,
      filesRemoved,
      // This env distiniction is only necessary to maintain
      // backwards compatibility with the `@vercel/next` builder.
      env: { ...envConfigs.runEnv },
      buildEnv: { ...envConfigs.buildEnv },
    },
  };

  let buildResultOrOutputs;
  if (buildProcess) {
    buildProcess.send({
      type: 'build',
      requirePath,
      buildOptions,
    });

    buildResultOrOutputs = await new Promise((resolve, reject) => {
      function onMessage({ type, result, error }: BuildMessageResult) {
        cleanup();
        if (type === 'buildResult') {
          if (result) {
            resolve(result);
          } else if (error) {
            reject(Object.assign(new Error(), error));
          }
        } else {
          reject(new Error(`Got unexpected message type: ${type}`));
        }
      }
      function onExit(code: number | null, signal: string | null) {
        cleanup();
        const err = new Error(
          `Builder exited with ${signal || code} before sending build result`
        );
        reject(err);
      }
      function cleanup() {
        buildProcess!.removeListener('close', onExit);
        buildProcess!.removeListener('message', onMessage);
      }
      buildProcess!.on('close', onExit);
      buildProcess!.on('message', onMessage);
    });
  } else {
    buildResultOrOutputs = await builder.build(buildOptions);
  }

  // Sort out build result to builder v2 shape
  if (!builder.version || (builder as any).version === 1) {
    // `BuilderOutputs` map was returned (Now Builder v1 behavior)
    result = {
      output: buildResultOrOutputs as BuilderOutputs,
      routes: [],
      watch: [],
    };
  } else if (builder.version === 2) {
    result = buildResultOrOutputs as BuildResult;
  } else if (builder.version === 3) {
    const { output, ...rest } = buildResultOrOutputs as BuildResultV3;

    if (!output || (output as BuilderOutput).type !== 'Lambda') {
      throw new Error('The result of "builder.build()" must be a `Lambda`');
    }

    if (output.maxDuration) {
      throw new Error(
        'The result of "builder.build()" must not contain `maxDuration`'
      );
    }

    if (output.memory) {
      throw new Error(
        'The result of "builder.build()" must not contain `memory`'
      );
    }

    for (const [src, func] of Object.entries(config.functions || {})) {
      if (src === entrypoint || minimatch(entrypoint, src)) {
        if (func.maxDuration) {
          output.maxDuration = func.maxDuration;
        }

        if (func.memory) {
          output.memory = func.memory;
        }

        break;
      }
    }

    result = {
      ...rest,
      output: {
        [entrypoint]: output,
      },
    } as BuildResult;
  } else {
    throw new Error(
      `${getTitleName()} CLI does not support builder version ${
        (builder as any).version
      }.\nPlease run \`${await getUpdateCommand()}\` to update to the latest CLI.`
    );
  }

  // Normalize Builder Routes
  const normalized = normalizeRoutes(result.routes);
  if (normalized.error) {
    throw new Error(normalized.error.message);
  } else {
    result.routes = normalized.routes || [];
  }

  const { output: buildOutput } = result;
  const { cleanUrls } = vercelConfig;

  // Mimic fmeta-util and perform file renaming
  for (const [originalPath, value] of Object.entries(buildOutput)) {
    let path = normalizePath(originalPath);

    if (cleanUrls && path.endsWith('.html')) {
      path = path.slice(0, -5);

      if (value.type === 'FileBlob' || value.type === 'FileFsRef') {
        value.contentType = value.contentType || 'text/html; charset=utf-8';
      }
    }

    const extensionless = devServer.getExtensionlessFile(path);
    if (extensionless) {
      path = extensionless;
    }

    buildOutput[path] = value;
  }

  // Convert the JSON-ified output map back into their corresponding `File`
  // subclass type instances.
  for (const name of Object.keys(buildOutput)) {
    const obj = buildOutput[name] as File | Lambda;
    let lambda: BuiltLambda;
    let fileRef: FileFsRef;
    let fileBlob: FileBlob;
    switch (obj.type) {
      case 'FileFsRef':
        fileRef = Object.assign(Object.create(FileFsRef.prototype), obj);
        buildOutput[name] = fileRef;
        break;
      case 'FileBlob':
        fileBlob = Object.assign(Object.create(FileBlob.prototype), obj);
        fileBlob.data = Buffer.from((obj as any).data.data);
        buildOutput[name] = fileBlob;
        break;
      case 'Lambda':
        lambda = Object.assign(Object.create(Lambda.prototype), obj);
        // Convert the JSON-ified Buffer object back into an actual Buffer
        lambda.zipBuffer = Buffer.from((obj as any).zipBuffer.data);
        buildOutput[name] = lambda;
        break;
      default:
        throw new Error(`Unknown file type: ${obj.type}`);
    }
  }

  // The `watch` array must not have "./" prefix, so if the builder returned
  // watched files that contain "./" strip them here for ease of writing the
  // builder.
  result.watch = (result.watch || []).map((w: string) => {
    if (w.startsWith('./')) {
      return w.substring(2);
    }
    return w;
  });

  // The `entrypoint` should always be watched, since we know that it was used
  // to produce the build output. This is for builders that don't implement
  // a fully featured `watch` return value.
  if (!result.watch.includes(entrypoint)) {
    result.watch.push(entrypoint);
  }

  // Enforce the lambda zip size soft watermark
  const maxLambdaBytes = bytes('50mb');
  for (const asset of Object.values(result.output)) {
    if (
      asset.type === 'Lambda' &&
      !(typeof asset.runtime === 'string' && asset.runtime.startsWith('python'))
    ) {
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

        const ZipFile = asset.zipBuffer || (await asset.createZip());

        asset.fn = await createFunction({
          Code: { ZipFile },
          Handler: asset.handler,
          Runtime: asset.runtime,
          MemorySize: asset.memory || 3009,
          Environment: {
            Variables: {
              ...vercelConfig.env,
              ...asset.environment,
              ...envConfigs.runEnv,
            },
          },
        });
      }

      match.buildTimestamp = Date.now();
    })
  );

  match.buildResults.set(requestPath, result);
  Object.assign(match.buildOutput, result.output);

  if (showBuildTimestamp) {
    const endTime = Date.now();
    output.log(`Built ${use}:${entrypoint} [${ms(endTime - startTime)}]`);
  }
}

export async function getBuildMatches(
  vercelConfig: VercelConfig,
  cwd: string,
  devServer: DevServer,
  fileList: string[]
): Promise<BuildMatch[]> {
  const matches: BuildMatch[] = [];

  if (fileList.length === 0) {
    // If there's no files in the cwd then we know there won't be any build
    // matches, so bail eagerly, and avoid printing the "no matches" message.
    return matches;
  }

  const noMatches: Builder[] = [];
  const builds = vercelConfig.builds || [{ src: '**', use: '@vercel/static' }];
  const builderSpecs = new Set(builds.map(b => b.use).filter(Boolean));
  const buildersWithPkgs = await importBuilders(builderSpecs, cwd);

  for (const buildConfig of builds) {
    // eslint-disable-next-line prefer-const
    let { src = '**', use, config = {} } = buildConfig;

    if (!use) {
      continue;
    }

    if (src[0] === '/') {
      // Remove a leading slash so that the globbing is relative to `cwd`
      // instead of the root of the filesystem. This matches the behavior
      // of Vercel deployments.
      src = src.substring(1);
    }

    // lambda function files are trimmed of their file extension
    const mapToEntrypoint = new Map<string, string>();
    const extensionless = devServer.getExtensionlessFile(src);
    if (extensionless) {
      mapToEntrypoint.set(extensionless, src);
      src = extensionless;
    }

    const files = fileList
      .filter(name => name === src || minimatch(name, src, { dot: true }))
      .map(name => join(cwd, name));

    if (files.length === 0) {
      noMatches.push(buildConfig);
    }

    for (const file of files) {
      src = relative(cwd, file);

      const entrypoint = mapToEntrypoint.get(src) || src;

      // Remove the output directory prefix
      if (config.zeroConfig && config.outputDirectory) {
        const outputMatch = config.outputDirectory + '/';
        if (src.startsWith(outputMatch)) {
          src = src.slice(outputMatch.length);
        }
      }

      const builderWithPkg = buildersWithPkgs.get(use);
      if (!builderWithPkg) {
        throw new Error(`Failed to load Builder "${use}"`);
      }

      matches.push({
        ...buildConfig,
        src,
        entrypoint,
        builderWithPkg,
        buildOutput: {},
        buildResults: new Map(),
        buildTimestamp: 0,
      });
    }
  }

  if (noMatches.length > 0) {
    output.warn(
      `You defined ${plural(
        'build',
        noMatches.length,
        true
      )} that did not match any source files (please ensure they are NOT defined in ${highlight(
        '.vercelignore'
      )}):`
    );
    for (const buildConfig of noMatches) {
      output.print(`- ${JSON.stringify(buildConfig)}\n`);
    }
  }

  return matches;
}

export async function shutdownBuilder(match: BuildMatch): Promise<void> {
  const ops: Promise<void>[] = [];

  if (match.buildProcess) {
    const { pid } = match.buildProcess;
    output.debug(`Killing builder sub-process with PID ${pid}`);
    const killPromise = treeKill(pid!)
      .then(() => {
        output.debug(`Killed builder with PID ${pid}`);
      })
      .catch((err: Error) => {
        output.debug(`Failed to kill builder with PID ${pid}: ${err}`);
      });
    ops.push(killPromise);
    delete match.buildProcess;
  }

  if (match.buildOutput) {
    for (const asset of Object.values(match.buildOutput)) {
      if (asset.type === 'Lambda' && asset.fn) {
        output.debug(`Shutting down Lambda function`);
        ops.push(asset.fn.destroy());
      }
    }
  }

  await Promise.all(ops);
}
