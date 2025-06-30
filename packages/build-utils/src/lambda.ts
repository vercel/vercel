import assert from 'assert';
import Sema from 'async-sema';
import { ZipFile } from 'yazl';
import minimatch from 'minimatch';
import { readlink } from 'fs-extra';
import { isSymbolicLink, isDirectory } from './fs/download';
import streamToBuffer from './fs/stream-to-buffer';
import type {
  Config,
  Env,
  Files,
  FunctionFramework,
  CloudEventTrigger,
} from './types';

export type { CloudEventTrigger };

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
  /**
   * Experimental CloudEvents trigger definitions that this Lambda can receive.
   * Defines what types of CloudEvents this Lambda can handle as an HTTP endpoint.
   * Currently supports HTTP protocol binding in structured mode only.
   * Only supports CloudEvents specification version 1.0.
   *
   * The delivery configuration provides HINTS to the system about preferred
   * execution behavior (concurrency, retries) but these are NOT guarantees.
   * The system may disregard these hints based on resource constraints.
   *
   * IMPORTANT: HTTP request-response semantics remain synchronous regardless
   * of delivery configuration. Callers receive immediate responses.
   *
   * @experimental This feature is experimental and may change.
   */
  experimentalTriggers?: CloudEventTrigger[];
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

function getDefaultLambdaArchitecture(
  architecture: LambdaArchitecture | undefined
): LambdaArchitecture {
  if (architecture) {
    return architecture;
  }

  switch (process.arch) {
    case 'arm':
    case 'arm64': {
      return 'arm64';
    }
    default: {
      return 'x86_64';
    }
  }
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
  architecture: LambdaArchitecture;
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
  /**
   * Experimental CloudEvents trigger definitions that this Lambda can receive.
   * Defines what types of CloudEvents this Lambda can handle as an HTTP endpoint.
   * Currently supports HTTP protocol binding in structured mode only.
   * Only supports CloudEvents specification version 1.0.
   *
   * The delivery configuration provides HINTS to the system about preferred
   * execution behavior (concurrency, retries) but these are NOT guarantees.
   * The system may disregard these hints based on resource constraints.
   *
   * IMPORTANT: HTTP request-response semantics remain synchronous regardless
   * of delivery configuration. Callers receive immediate responses.
   *
   * @experimental This feature is experimental and may change.
   */
  experimentalTriggers?: CloudEventTrigger[];

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
      experimentalTriggers,
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

    if (experimentalTriggers !== undefined) {
      assert(
        Array.isArray(experimentalTriggers),
        '"experimentalTriggers" is not an Array'
      );

      for (let i = 0; i < experimentalTriggers.length; i++) {
        const trigger = experimentalTriggers[i];
        const prefix = `"experimentalTriggers[${i}]"`;

        assert(
          typeof trigger === 'object' && trigger !== null,
          `${prefix} is not an object`
        );

        // Validate required CloudEventTrigger attributes
        assert(
          trigger.triggerVersion === 1,
          `${prefix}.triggerVersion must be 1`
        );

        assert(
          trigger.specversion === '1.0',
          `${prefix}.specversion must be "1.0"`
        );

        assert(
          typeof trigger.type === 'string',
          `${prefix}.type is not a string`
        );
        assert(trigger.type.length > 0, `${prefix}.type cannot be empty`);

        // Validate required httpBinding
        const binding = trigger.httpBinding;
        const bindingPrefix = `${prefix}.httpBinding`;

        assert(
          typeof binding === 'object' && binding !== null,
          `${bindingPrefix} is required and must be an object`
        );
        assert(
          binding.mode === 'structured',
          `${bindingPrefix}.mode must be "structured"`
        );

        // Validate optional HTTP configuration within httpBinding
        if (binding.method !== undefined) {
          const validMethods = ['GET', 'POST', 'HEAD'];
          assert(
            validMethods.includes(binding.method),
            `${bindingPrefix}.method must be one of: ${validMethods.join(', ')}`
          );
        }

        if (binding.pathname !== undefined) {
          assert(
            typeof binding.pathname === 'string',
            `${bindingPrefix}.pathname must be a string`
          );
          assert(
            binding.pathname.length > 0,
            `${bindingPrefix}.pathname cannot be empty`
          );
          assert(
            binding.pathname.startsWith('/'),
            `${bindingPrefix}.pathname must start with '/'`
          );
        }

        // Validate optional delivery configuration
        if (trigger.delivery !== undefined) {
          const delivery = trigger.delivery;
          const deliveryPrefix = `${prefix}.delivery`;

          assert(
            typeof delivery === 'object' && delivery !== null,
            `${deliveryPrefix} must be an object`
          );

          if (delivery.maxConcurrency !== undefined) {
            assert(
              typeof delivery.maxConcurrency === 'number',
              `${deliveryPrefix}.maxConcurrency must be a number`
            );
            assert(
              Number.isInteger(delivery.maxConcurrency) &&
                delivery.maxConcurrency > 0,
              `${deliveryPrefix}.maxConcurrency must be a positive integer`
            );
          }

          if (delivery.maxAttempts !== undefined) {
            assert(
              typeof delivery.maxAttempts === 'number',
              `${deliveryPrefix}.maxAttempts must be a number`
            );
            assert(
              Number.isInteger(delivery.maxAttempts) &&
                delivery.maxAttempts >= 0,
              `${deliveryPrefix}.maxAttempts must be a non-negative integer`
            );
          }

          if (delivery.retryAfterSeconds !== undefined) {
            assert(
              typeof delivery.retryAfterSeconds === 'number',
              `${deliveryPrefix}.retryAfterSeconds must be a number`
            );
            assert(
              delivery.retryAfterSeconds > 0,
              `${deliveryPrefix}.retryAfterSeconds must be a positive number`
            );
          }
        }
      }
    }

    this.type = 'Lambda';
    this.operationType = operationType;
    this.files = 'files' in opts ? opts.files : undefined;
    this.handler = handler;
    this.runtime = runtime;
    this.architecture = getDefaultLambdaArchitecture(architecture);
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
    this.experimentalTriggers = experimentalTriggers;
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
      symlinkTargets.set(name, symlinkTarget);
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
  Pick<LambdaOptions, 'architecture' | 'memory' | 'maxDuration'>
> {
  if (config?.functions) {
    for (const [pattern, fn] of Object.entries(config.functions)) {
      if (sourceFile === pattern || minimatch(sourceFile, pattern)) {
        return {
          architecture: fn.architecture,
          memory: fn.memory,
          maxDuration: fn.maxDuration,
        };
      }
    }
  }

  return {};
}
