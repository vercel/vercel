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
  TriggerEvent,
} from './types';

export type { TriggerEvent };

export type LambdaOptions = LambdaOptionsWithFiles | LambdaOptionsWithZipBuffer;

export type LambdaExecutableRuntimeLanguages = 'rust';
export type LambdaArchitecture = 'x86_64' | 'arm64';

export interface LambdaOptionsBase {
  handler: string;
  runtime: string;
  runtimeLanguage?: LambdaExecutableRuntimeLanguages;
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
   * Experimental trigger event definitions that this Lambda can receive.
   * Defines what types of trigger events this Lambda can handle as an HTTP endpoint.
   * Currently supports queue triggers for Vercel's queue system.
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
  experimentalTriggers?: TriggerEvent[];
  /**
   * Whether this Lambda supports cancellation.
   * When true, the Lambda runtime can be terminated mid-execution if the request is cancelled.
   */
  supportsCancellation?: boolean;

  /**
   * Whether to disable automatic fetch instrumentation.
   * When true, the Function runtime will not automatically instrument fetch calls.
   */
  shouldDisableAutomaticFetchInstrumentation?: boolean;
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
  /**
   * When using a generic runtime such as "executable" or "provided" (custom runtimes),
   * this field can be used to specify the language the executable was compiled with.
   */
  runtimeLanguage?: LambdaExecutableRuntimeLanguages;
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
   * Experimental trigger event definitions that this Lambda can receive.
   * Defines what types of trigger events this Lambda can handle as an HTTP endpoint.
   * Currently supports queue triggers for Vercel's queue system.
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
  experimentalTriggers?: TriggerEvent[];
  /**
   * Whether this Lambda supports cancellation.
   * When true, the Lambda runtime can be terminated mid-execution if the request is cancelled.
   */
  supportsCancellation?: boolean;

  /**
   * Whether to disable automatic fetch instrumentation.
   * When true, the Function runtime will not automatically instrument fetch calls.
   */
  shouldDisableAutomaticFetchInstrumentation?: boolean;

  constructor(opts: LambdaOptions) {
    const {
      handler,
      runtime,
      runtimeLanguage,
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
      supportsCancellation,
      shouldDisableAutomaticFetchInstrumentation,
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

    if (runtimeLanguage !== undefined) {
      assert(runtimeLanguage === 'rust', '"runtimeLanguage" must be "rust"');
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

        // Validate required type
        assert(
          trigger.type === 'queue/v1beta',
          `${prefix}.type must be "queue/v1beta"`
        );

        // Validate required queue fields
        assert(
          typeof trigger.topic === 'string',
          `${prefix}.topic is required and must be a string`
        );
        assert(trigger.topic.length > 0, `${prefix}.topic cannot be empty`);

        assert(
          typeof trigger.consumer === 'string',
          `${prefix}.consumer is required and must be a string`
        );
        assert(
          trigger.consumer.length > 0,
          `${prefix}.consumer cannot be empty`
        );

        // Validate optional queue configuration
        if (trigger.maxDeliveries !== undefined) {
          assert(
            typeof trigger.maxDeliveries === 'number',
            `${prefix}.maxDeliveries must be a number`
          );
          assert(
            Number.isInteger(trigger.maxDeliveries) &&
              trigger.maxDeliveries >= 1,
            `${prefix}.maxDeliveries must be at least 1`
          );
        }

        if (trigger.retryAfterSeconds !== undefined) {
          assert(
            typeof trigger.retryAfterSeconds === 'number',
            `${prefix}.retryAfterSeconds must be a number`
          );
          assert(
            trigger.retryAfterSeconds > 0,
            `${prefix}.retryAfterSeconds must be a positive number`
          );
        }

        if (trigger.initialDelaySeconds !== undefined) {
          assert(
            typeof trigger.initialDelaySeconds === 'number',
            `${prefix}.initialDelaySeconds must be a number`
          );
          assert(
            trigger.initialDelaySeconds >= 0,
            `${prefix}.initialDelaySeconds must be a non-negative number`
          );
        }
      }
    }

    if (supportsCancellation !== undefined) {
      assert(
        typeof supportsCancellation === 'boolean',
        '"supportsCancellation" is not a boolean'
      );
    }

    this.type = 'Lambda';
    this.operationType = operationType;
    this.files = 'files' in opts ? opts.files : undefined;
    this.handler = handler;
    this.runtime = runtime;
    this.runtimeLanguage = runtimeLanguage;
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
    this.supportsCancellation = supportsCancellation;
    this.shouldDisableAutomaticFetchInstrumentation =
      shouldDisableAutomaticFetchInstrumentation;
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
  Pick<
    LambdaOptions,
    | 'architecture'
    | 'memory'
    | 'maxDuration'
    | 'experimentalTriggers'
    | 'supportsCancellation'
  >
> {
  if (config?.functions) {
    for (const [pattern, fn] of Object.entries(config.functions)) {
      if (sourceFile === pattern || minimatch(sourceFile, pattern)) {
        return {
          architecture: fn.architecture,
          memory: fn.memory,
          maxDuration: fn.maxDuration,
          experimentalTriggers: fn.experimentalTriggers,
          supportsCancellation: fn.supportsCancellation,
        };
      }
    }
  }

  return {};
}
