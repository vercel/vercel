import assert from 'assert';
import Sema from 'async-sema';
import { ZipFile } from 'yazl';
import minimatch from 'minimatch';
import { readlink, Stats } from 'fs-extra';
import streamToBuffer from './fs/stream-to-buffer';
import type { Files, Config } from './types';

interface Environment {
  [key: string]: string;
}

export type LambdaOptions = LambdaOptionsWithFiles | LambdaOptionsWithZipBuffer;

export interface LambdaOptionsBase {
  handler: string;
  runtime: string;
  memory?: number;
  maxDuration?: number;
  environment?: Environment;
  allowQuery?: string[];
  regions?: string[];
  supportsMultiPayloads?: boolean;
  supportsWrapper?: boolean;
}

export interface LambdaOptionsWithFiles extends LambdaOptionsBase {
  files: Files;
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
  files?: Files;
  handler: string;
  runtime: string;
  memory?: number;
  maxDuration?: number;
  environment: Environment;
  allowQuery?: string[];
  regions?: string[];
  /**
   * @deprecated Use `await lambda.createZip()` instead.
   */
  zipBuffer?: Buffer;
  supportsMultiPayloads?: boolean;
  supportsWrapper?: boolean;

  constructor(opts: LambdaOptions) {
    const {
      handler,
      runtime,
      maxDuration,
      memory,
      environment = {},
      allowQuery,
      regions,
      supportsMultiPayloads,
      supportsWrapper,
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
    this.type = 'Lambda';
    this.files = 'files' in opts ? opts.files : undefined;
    this.handler = handler;
    this.runtime = runtime;
    this.memory = memory;
    this.maxDuration = maxDuration;
    this.environment = environment;
    this.allowQuery = allowQuery;
    this.regions = regions;
    this.zipBuffer = 'zipBuffer' in opts ? opts.zipBuffer : undefined;
    this.supportsMultiPayloads = supportsMultiPayloads;
    this.supportsWrapper = supportsWrapper;
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
  const stat = new Stats();
  const zipFile = new ZipFile();

  for (const name of Object.keys(files).sort()) {
    const file = files[name];
    const opts = { mode: file.mode, mtime };
    stat.mode = file.mode;
    if (stat.isSymbolicLink() && file.type === 'FileFsRef') {
      const symlinkTarget = await readlink(file.fsPath);
      zipFile.addBuffer(Buffer.from(symlinkTarget, 'utf8'), name, opts);
    } else if (stat.isDirectory()) {
      zipFile.addEmptyDirectory(name);
    } else {
      // Assume a regular file
      const stream = file.toStream();
      zipFile.addReadStream(stream, name, opts);
    }
  }

  zipFile.end();
  return streamToBuffer(zipFile.outputStream);
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
