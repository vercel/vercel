import assert from 'assert';
import Sema from 'async-sema';
import { ZipFile } from 'yazl';
import minimatch from 'minimatch';
import { lstat, readlink } from 'fs-extra';
import { dirname, resolve } from 'path';
import { isSymbolicLink, isDirectory } from './fs/download';
import streamToBuffer from './fs/stream-to-buffer';
import type { Config, Env, Files, FunctionFramework } from './types';

export type LambdaOptions = LambdaOptionsWithFiles | LambdaOptionsWithZipBuffer;

export type LambdaArchitecture = 'x86_64' | 'arm64';

export interface LambdaOptionsBase {
  handler: string;
  runtime: string;
  architecture?: LambdaArchitecture;
  memory?: number;
  maxDuration?: number;
  environment?: Env;
  allowQuery?: string[];
  regions?: string[];
  supportsMultiPayloads?: boolean;
  supportsWrapper?: boolean;
  supportsResponseStreaming?: boolean;
  /**
   * @deprecated Use the `supportsResponseStreaming` property instead.
   */
  experimentalResponseStreaming?: boolean;
  operationType?: string;
  framework?: FunctionFramework;
}

export interface LambdaOptionsWithFiles extends LambdaOptionsBase {
  files: Files;
  experimentalAllowBundling?: boolean;
}

/**
 * @deprecated Use `LambdaOptionsWithFiles` instead.
 */
export interface LambdaOptionsWithZipBuffer extends LambdaOptionsBase {
  /**
   * @deprecated Use `files` property instead.
   */
  zipBuffer: Buffer;
}

interface GetLambdaOptionsFromFunctionOptions {
  sourceFile: string;
  config?: Pick<Config, 'functions'>;
}

export class Lambda {
  type: 'Lambda';
  /**
   * This is a label for the type of Lambda a framework is producing.
   * The value can be any string that makes sense for a given framework.
   * Examples: "API", "ISR", "SSR", "SSG", "Render", "Resource"
   */
  operationType?: string;
  files?: Files;
  handler: string;
  runtime: string;
  architecture?: LambdaArchitecture;
  memory?: number;
  maxDuration?: number;
  environment: Env;
  allowQuery?: string[];
  regions?: string[];
  /**
   * @deprecated Use `await lambda.createZip()` instead.
   */
  zipBuffer?: Buffer;
  supportsMultiPayloads?: boolean;
  supportsWrapper?: boolean;
  supportsResponseStreaming?: boolean;
  framework?: FunctionFramework;
  experimentalAllowBundling?: boolean;

  constructor(opts: LambdaOptions) {
    const {
      handler,
      runtime,
      maxDuration,
      architecture,
      memory,
      environment = {},
      allowQuery,
      regions,
      supportsMultiPayloads,
      supportsWrapper,
      supportsResponseStreaming,
      experimentalResponseStreaming,
      operationType,
      framework,
    } = opts;
    if ('files' in opts) {
      assert(typeof opts.files === 'object', '"files" must be an object');
    }
    if ('zipBuffer' in opts) {
      assert(Buffer.isBuffer(opts.zipBuffer), '"zipBuffer" must be a Buffer');
    }
    assert(typeof handler === 'string', '"handler" is not a string');
    assert(typeof runtime === 'string', '"runtime" is not a string');
    assert(typeof environment === 'object', '"environment" is not an object');

    if (architecture !== undefined) {
      assert(
        architecture === 'x86_64' || architecture === 'arm64',
        '"architecture" must be either "x86_64" or "arm64"'
      );
    }

    if (
      'experimentalAllowBundling' in opts &&
      opts.experimentalAllowBundling !== undefined
    ) {
      assert(
        typeof opts.experimentalAllowBundling === 'boolean',
        '"experimentalAllowBundling" is not a boolean'
      );
    }

    if (memory !== undefined) {
      assert(typeof memory === 'number', '"memory" is not a number');
    }

    if (maxDuration !== undefined) {
      assert(typeof maxDuration === 'number', '"maxDuration" is not a number');
    }

    if (allowQuery !== undefined) {
      assert(Array.isArray(allowQuery), '"allowQuery" is not an Array');
      assert(
        allowQuery.every(q => typeof q === 'string'),
        '"allowQuery" is not a string Array'
      );
    }

    if (supportsMultiPayloads !== undefined) {
      assert(
        typeof supportsMultiPayloads === 'boolean',
        '"supportsMultiPayloads" is not a boolean'
      );
    }

    if (supportsWrapper !== undefined) {
      assert(
        typeof supportsWrapper === 'boolean',
        '"supportsWrapper" is not a boolean'
      );
    }

    if (regions !== undefined) {
      assert(Array.isArray(regions), '"regions" is not an Array');
      assert(
        regions.every(r => typeof r === 'string'),
        '"regions" is not a string Array'
      );
    }

    if (framework !== undefined) {
      assert(typeof framework === 'object', '"framework" is not an object');
      assert(
        typeof framework.slug === 'string',
        '"framework.slug" is not a string'
      );
      if (framework.version !== undefined) {
        assert(
          typeof framework.version === 'string',
          '"framework.version" is not a string'
        );
      }
    }

    this.type = 'Lambda';
    this.operationType = operationType;
    this.files = 'files' in opts ? opts.files : undefined;
    this.handler = handler;
    this.runtime = runtime;
    this.architecture = architecture;
    this.memory = memory;
    this.maxDuration = maxDuration;
    this.environment = environment;
    this.allowQuery = allowQuery;
    this.regions = regions;
    this.zipBuffer = 'zipBuffer' in opts ? opts.zipBuffer : undefined;
    this.supportsMultiPayloads = supportsMultiPayloads;
    this.supportsWrapper = supportsWrapper;
    this.supportsResponseStreaming =
      supportsResponseStreaming ?? experimentalResponseStreaming;
    this.framework = framework;
    this.experimentalAllowBundling =
      'experimentalAllowBundling' in opts
        ? opts.experimentalAllowBundling
        : undefined;
  }

  async createZip(): Promise<Buffer> {
    let { zipBuffer } = this;
    if (!zipBuffer) {
      if (!this.files) {
        throw new Error('`files` is not defined');
      }
      await sema.acquire();
      try {
        zipBuffer = await createZip(this.files);
      } finally {
        sema.release();
      }
    }
    return zipBuffer;
  }

  /**
   * @deprecated Use the `supportsResponseStreaming` property instead.
   */
  get experimentalResponseStreaming(): boolean | undefined {
    return this.supportsResponseStreaming;
  }
  set experimentalResponseStreaming(v: boolean | undefined) {
    this.supportsResponseStreaming = v;
  }
}

const sema = new Sema(10);
const mtime = new Date(1540000000000);

/**
 * @deprecated Use `new Lambda()` instead.
 */
export async function createLambda(opts: LambdaOptions): Promise<Lambda> {
  const lambda = new Lambda(opts);

  // backwards compat
  lambda.zipBuffer = await lambda.createZip();

  return lambda;
}

export async function createZip(files: Files): Promise<Buffer> {
  const names = Object.keys(files).sort();

  const symlinkTargets = new Map<string, string>();
  for (const name of names) {
    const file = files[name];
    if (file.mode && isSymbolicLink(file.mode) && file.type === 'FileFsRef') {
      const symlinkTarget = await readlink(file.fsPath);
      const symlinkTargetPath = resolve(dirname(file.fsPath), symlinkTarget);
      try {
        // Check if the symlink target exists
        await lstat(symlinkTargetPath);
        symlinkTargets.set(name, symlinkTarget);
      } catch (e) {
        throw new Error(`Symlink target does not exist: ${symlinkTargetPath}`);
      }
    }
  }

  const zipFile = new ZipFile();
  const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
    for (const name of names) {
      const file = files[name];
      const opts = { mode: file.mode, mtime };
      const symlinkTarget = symlinkTargets.get(name);
      if (typeof symlinkTarget === 'string') {
        zipFile.addBuffer(Buffer.from(symlinkTarget, 'utf8'), name, opts);
      } else if (file.mode && isDirectory(file.mode)) {
        zipFile.addEmptyDirectory(name, opts);
      } else {
        const stream = file.toStream();
        stream.on('error', reject);
        zipFile.addReadStream(stream, name, opts);
      }
    }

    zipFile.end();
    streamToBuffer(zipFile.outputStream).then(resolve).catch(reject);
  });

  return zipBuffer;
}

export async function getLambdaOptionsFromFunction({
  sourceFile,
  config,
}: GetLambdaOptionsFromFunctionOptions): Promise<
  Pick<LambdaOptions, 'memory' | 'maxDuration'>
> {
  if (config?.functions) {
    for (const [pattern, fn] of Object.entries(config.functions)) {
      if (sourceFile === pattern || minimatch(sourceFile, pattern)) {
        return {
          memory: fn.memory,
          maxDuration: fn.maxDuration,
        };
      }
    }
  }

  return {};
}
