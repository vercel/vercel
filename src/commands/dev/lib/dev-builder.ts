/* disable this rule _here_ to avoid conflict with ongoing changes */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import ms from 'ms';
import bytes from 'bytes';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';
import { fork, ChildProcess } from 'child_process';
import { readFile, mkdirp } from 'fs-extra';
import ignore, { Ignore } from '@zeit/dockerignore';
import { createFunction, initializeRuntime } from '@zeit/fun';
import { File, Lambda, FileBlob, FileFsRef } from '@now/build-utils';
import stripAnsi from 'strip-ansi';
import chalk from 'chalk';
import ora from 'ora';

import { globBuilderInputs } from './glob';
import DevServer from './dev-server';
import IGNORED from '../../../util/ignored';
import { Output } from '../../../util/output';
import { LambdaSizeExceededError } from '../../../util/errors-ts';
import { builderModulePathPromise, getBuilder } from './builder-cache';
import {
  EnvConfig,
  NowConfig,
  BuildMatch,
  BuildResult,
  BuilderInputs,
  BuilderOutput,
  BuilderOutputs
} from './types';

interface BuildMessage {
  type: string;
};

interface BuildMessageResult extends BuildMessage {
  type: 'buildResult';
  result?: BuilderOutputs | BuildResult;
  error?: object;
};

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

const isLogging = new WeakSet<ChildProcess>();

let nodeBinPromise: Promise<string>;

async function getNodeBin(): Promise<string> {
  const runtime = await initializeRuntime('nodejs8.10');
  if (!runtime.cacheDir) {
    throw new Error('nodejs8.10 runtime failed to initialize');
  }
  const nodeBin = join(runtime.cacheDir, 'bin', 'node');
  return nodeBin;
}

function pipeChildLogging(child: ChildProcess): void {
  if (!isLogging.has(child)) {
    child.stdout!.pipe(process.stdout);
    child.stderr!.pipe(process.stderr);
    isLogging.add(child);
  }
}

async function createBuildProcess(
  match: BuildMatch,
  buildEnv: EnvConfig,
  output: Output
): Promise<ChildProcess> {
  if (!nodeBinPromise) {
    nodeBinPromise = getNodeBin();
  }
  const [execPath, modulePath] = await Promise.all([
    nodeBinPromise,
    builderModulePathPromise
  ]);
  const buildProcess = fork(modulePath, [], {
    cwd: match.workPath,
    env: {
      ...process.env,
      PATH: `${dirname(execPath)}:${process.env.PATH}`,
      ...buildEnv
    },
    execPath,
    execArgv: [],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  match.buildProcess = buildProcess;

  buildProcess.on('message', m => {
    // console.log('got message from builder:', m);
  });
  buildProcess.on('exit', (code, signal) => {
    output.debug(
      `Build process for ${match.src} exited with ${signal || code}`
    );
    match.buildProcess = undefined;
  });

  buildProcess.stdout!.setEncoding('utf8');
  buildProcess.stderr!.setEncoding('utf8');

  return new Promise((resolve, reject) => {
    // The first message that the builder process sends is the `ready` event
    buildProcess.once('message', ({ type }) => {
      if (type !== 'ready') {
        reject(new Error('Did not get "ready" event from builder'));
      } else {
        resolve(buildProcess);
      }
    });
  });
}

export async function executeBuild(
  nowJson: NowConfig,
  devServer: DevServer,
  files: BuilderInputs,
  match: BuildMatch,
  requestPath: string | null,
  isInitialBuild: boolean,
  filesChanged?: string[],
  filesRemoved?: string[]
): Promise<void> {
  const {
    builderWithPkg: { runInProcess, builder, package: pkg }
  } = match;
  const { env } = devServer;
  const { src: entrypoint, workPath } = match;
  await mkdirp(workPath);

  const startTime = Date.now();

  if (match.use !== '@now/static') {
    devServer.output.debug(
      `${pkg.version ? `v${pkg.version} ` : ''}(workPath = ${workPath})`
    );
  }

  const builderConfig = builder.config || {};
  const config = match.config || {};

  let result: BuildResult;

  let { buildProcess } = match;
  if (!runInProcess && !buildProcess) {
    devServer.output.debug(`Creating build process for ${entrypoint}`);
    buildProcess = await createBuildProcess(
      match,
      devServer.buildEnv,
      devServer.output
    );
  }

  const buildParams = {
    files,
    entrypoint,
    workPath,
    config,
    meta: { isDev: true, requestPath, filesChanged, filesRemoved }
  };

  let buildResultOrOutputs: BuilderOutputs | BuildResult;
  if (buildProcess) {
    let spinLogger;

    if (isInitialBuild && process.stdout.isTTY) {
      const logTitle = `${chalk.bold(`Setting up Builder for ${chalk.underline(entrypoint)}`)}:`;
      const fullLogs: string[] = [];
      const spinner = ora(logTitle).start();

      buildProcess!.on('message', ({ type }) => {
        if (type === 'buildResult') {
          spinner.stop();
        }
      });

      buildProcess!.on('error', () => {
        spinner.stop();
        console.error(fullLogs.join('\n'));
      });

      spinLogger = (data: Buffer) => {
        const rawLog = stripAnsi(data.toString());
        fullLogs.push(rawLog);

        const lines = rawLog.replace(/\s+$/, '').split('\n');
        const spinText = `${logTitle} ${lines[lines.length - 1]}`;
        const maxCols = process.stdout.columns || 80;
        const overflow = stripAnsi(spinText).length + 2 - maxCols;
        spinner.text = overflow > 0 ? `${spinText.slice(0, -overflow - 3)}...` : spinText;
      };

      buildProcess!.stdout!.on('data', spinLogger);
      buildProcess!.stderr!.on('data', spinLogger);
    } else {
      pipeChildLogging(buildProcess!);
    }

    try {
      buildProcess.send({
        type: 'build',
        builderName: pkg.name,
        buildParams
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
          const err = new Error(`Builder exited with ${signal || code} before sending build result`);
          reject(err);
        }
        function cleanup() {
          buildProcess!.removeListener('exit', onExit);
          buildProcess!.removeListener('message', onMessage);
        }
        buildProcess!.on('exit', onExit);
        buildProcess!.on('message', onMessage);
      });
    } finally {
      if (spinLogger) {
        buildProcess.stdout!.removeListener('data', spinLogger);
        buildProcess.stderr!.removeListener('data', spinLogger);
      }
      pipeChildLogging(buildProcess!);
    }
  } else {
    buildResultOrOutputs = await builder.build(buildParams);
  }

  // Sort out build result to builder v2 shape
  if (builder.version === undefined) {
    // `BuilderOutputs` map was returned (Now Builder v1 behavior)
    result = {
      output: buildResultOrOutputs as BuilderOutputs,
      routes: [],
      watch: []
    };
  } else {
    result = buildResultOrOutputs as BuildResult;
  }

  // Convert the JSON-ified output map back into their corresponding `File`
  // subclass type instances.
  const output = result.output as BuilderOutputs;
  for (const name of Object.keys(output)) {
    const obj = output[name] as File;
    let lambda: Lambda;
    let fileRef: FileFsRef;
    let fileBlob: FileBlob;
    switch (obj.type) {
      case 'FileFsRef':
        fileRef = Object.assign(Object.create(FileFsRef.prototype), obj);
        output[name] = fileRef;
        break;
      case 'FileBlob':
        fileBlob = Object.assign(Object.create(FileBlob.prototype), obj);
        fileBlob.data = Buffer.from((obj as any).data.data);
        output[name] = fileBlob;
        break;
      case 'Lambda':
        lambda = Object.assign(Object.create(Lambda.prototype), obj) as Lambda;
        // Convert the JSON-ified Buffer object back into an actual Buffer
        lambda.zipBuffer = Buffer.from((obj as any).zipBuffer.data);
        output[name] = lambda;
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
