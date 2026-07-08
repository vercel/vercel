import { fork } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  type BuildOptions,
  type BuildResultV2,
  type BuildResultV3,
  Lambda,
  FileBlob,
  FileFsRef,
  FileRef,
  type TraceEvent,
} from '@vercel/build-utils';
import output from '../../output-manager';

/**
 * Runs a builder's `build()` in a forked child process for `vc build`, modeled after the
 * builder worker used by `vc dev`.
 *
 * Why out-of-process: the child is forked with piped stdout/stderr, and its own isolated env,
 * unlocking accurate attribution of every output line the build produces — including output
 * from subprocesses the builder spawns with `stdio: 'inherit'` (e.g. `next build`), which write
 * to the child's real file descriptors - and safe parallel builds in the future.
 *
 * The child side lives in `./builder-worker.cjs`. This module owns the parent half of the IPC
 * contract: send `{ type: 'build', requirePath, buildOptions }`, await `{ type: 'buildResult',
 * result | error }`, then rehydrate the serialized File/Lambda outputs into real instances.
 */

/** JSON-ified Buffer as serialized by Node.js IPC. */
interface SerializedBuffer {
  type: 'Buffer';
  data: number[];
}

/**
 * A serialized FileBlob. Its `data` is a string (passed through as-is), a JSON-ified Buffer
 * (`{type:'Buffer',data:[...]}` from IPC), or absent when the Buffer was too large and was
 * spilled to `dataPath`.
 */
interface SerializedFileBlob {
  type: 'FileBlob';
  data?: string | SerializedBuffer;
  dataPath?: string;
  [key: string]: unknown;
}

interface SerializedFileFsRef {
  type: 'FileFsRef';
  [key: string]: unknown;
}

interface SerializedFileRef {
  type: 'FileRef';
  [key: string]: unknown;
}

type SerializedFile =
  | SerializedFileBlob
  | SerializedFileFsRef
  | SerializedFileRef;

interface BuildMessageResult {
  type: 'buildResult';
  result?: BuildResultV2 | BuildResultV3;
  /** Serialized Files returned by the builder's `diagnostics()`, if any. */
  diagnostics?: Record<string, SerializedFile>;
  /** True when the builder registered a pre-deploy callback the worker is holding. */
  hasPreDeploy?: boolean;
  /** Trace events the builder recorded in the worker, to report under the parent span. */
  traceEvents?: TraceEvent[];
  error?: object;
}

interface PreDeployMessageResult {
  type: 'preDeployResult';
  /** Trace events the pre-deploy step recorded (e.g. `vc.builder.preDeploy`). */
  traceEvents?: TraceEvent[];
  error?: object;
}

/** A builder's rehydrated diagnostics: a map of filename → File instance. */
export type BuilderDiagnostics = Record<string, FileFsRef | FileBlob | FileRef>;

export interface BuildInSubprocessResult {
  buildResult: BuildResultV2 | BuildResultV3;
  diagnostics?: BuilderDiagnostics;
  /**
   * When the build registered a pre-deploy command, the worker is kept alive to run it later.
   * Call `runPreDeploy()` after all builds succeed (it runs the callback in the worker, with the
   * builder-computed env it captured). When there's no pre-deploy, the worker is already torn
   * down and this is undefined.
   */
  runPreDeploy?: () => Promise<void>;
}

/**
 * Whether a build can run in a forked worker:
 * - Only multi-service deployments fork for now. Forking exists to isolate and per-line tag each
 *   service's build output; single-project builds don't need it, so they stay on the in-process
 *   path to limit the blast radius of any regression.
 * - `@vercel/static` is a built-in with no module path to `require()` in the worker.
 * - `buildCallback` is a callback the builder invokes DURING `build()` that mutates parent
 *   state, so it can't cross the process boundary. (A pre-deploy callback, by contrast, runs
 *   after all builds via the worker keep-alive mechanism, so it does not block forking.)
 */
export function canBuildInSubprocess({
  hasDetectedServices,
  builderPath,
  hasBuildCallback,
}: {
  hasDetectedServices: boolean;
  builderPath: string;
  hasBuildCallback: boolean;
}): boolean {
  return hasDetectedServices && Boolean(builderPath) && !hasBuildCallback;
}

/** Re-prototype a plain object from IPC back into its File instance, by its `type` tag. */
function rehydrateFile(obj: SerializedFile): FileFsRef | FileBlob | FileRef {
  if (obj.type === 'FileBlob') {
    const blob: FileBlob = Object.assign(
      Object.create(FileBlob.prototype),
      obj
    );
    if (obj.dataPath) {
      // Large Buffer that was spilled to a temp file by the worker.
      blob.data = readFileSync(obj.dataPath);
      try {
        unlinkSync(obj.dataPath);
      } catch {
        // best-effort temp cleanup
      }
      delete (blob as { dataPath?: string }).dataPath;
    } else if (typeof obj.data === 'string') {
      // FileBlob.data may be a plain string; IPC passes it through unchanged.
      blob.data = obj.data;
    } else if (obj.data) {
      // A Buffer, serialized by IPC as { type: 'Buffer', data: number[] }.
      blob.data = Buffer.from(obj.data.data);
    }
    return blob;
  }
  if (obj.type === 'FileRef') {
    return Object.assign(Object.create(FileRef.prototype), obj);
  }
  return Object.assign(Object.create(FileFsRef.prototype), obj);
}

/** Rehydrate a serialized Files map in place. */
function rehydrateFiles(
  files: Record<string, SerializedFile> | undefined
): void {
  if (!files) return;
  for (const name of Object.keys(files)) {
    files[name] = rehydrateFile(files[name]) as unknown as SerializedFile;
  }
}

/** Rehydrate the builder's serialized diagnostics Files into real File instances. */
function rehydrateDiagnostics(
  diagnostics: Record<string, SerializedFile>
): BuilderDiagnostics {
  const result: BuilderDiagnostics = {};
  for (const [name, file] of Object.entries(diagnostics)) {
    result[name] = rehydrateFile(file);
  }
  return result;
}

/** Rehydrate a single Lambda/EdgeFunction/Prerender/File output from its serialized form. */
function rehydrateOutput(output: unknown): void {
  if (!output || typeof output !== 'object') return;
  const obj = output as {
    type?: string;
    files?: Record<string, SerializedFile>;
    lambda?: unknown;
    fallback?: unknown;
  };
  if (obj.type === 'Lambda') {
    rehydrateFiles(obj.files);
    Object.setPrototypeOf(obj, Lambda.prototype);
  } else if (obj.type === 'EdgeFunction') {
    rehydrateFiles(obj.files);
  } else if (obj.type === 'Prerender') {
    // Prerender wraps a Lambda and a fallback File, each needing rehydration.
    if (obj.lambda) rehydrateOutput(obj.lambda);
    if (obj.fallback) rehydrateOutput(obj.fallback);
  } else if (
    obj.type === 'FileFsRef' ||
    obj.type === 'FileBlob' ||
    obj.type === 'FileRef'
  ) {
    const rehydrated = rehydrateFile(obj as SerializedFile);
    Object.assign(obj, rehydrated);
    Object.setPrototypeOf(obj, Object.getPrototypeOf(rehydrated));
  }
}

/** Rehydrate all outputs of a build result (V2 map or V3 single output) in place. */
function rehydrateResult(result: BuildResultV2 | BuildResultV3): void {
  // BuildResultVX (version === -1) wraps the concrete result under `.result`; the worker sends
  // the wrapper untouched, so reach through it to rehydrate the real outputs.
  const unwrapped =
    result && 'resultVersion' in result
      ? (result as unknown as { result: BuildResultV2 | BuildResultV3 }).result
      : result;
  const output = (unwrapped as { output?: unknown }).output;
  if (!output) return;
  if ((output as { type?: string }).type) {
    // V3: a single output.
    rehydrateOutput(output);
  } else {
    // V2: a map of named outputs. Rehydrate real outputs first, then resolve any
    // { __sharedRef: <firstKey> } sentinels (see the worker) back to the same instance so
    // writeBuildResult's identity-based symlink dedup works across the process boundary.
    const map = output as Record<string, unknown>;
    for (const value of Object.values(map)) {
      if (!isSharedRef(value)) rehydrateOutput(value);
    }
    for (const key of Object.keys(map)) {
      const value = map[key];
      if (isSharedRef(value)) {
        map[key] = map[value.__sharedRef];
      }
    }
  }
}

function isSharedRef(value: unknown): value is { __sharedRef: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { __sharedRef?: unknown }).__sharedRef === 'string'
  );
}

export interface BuildInSubprocessOptions {
  /** Absolute path to the builder module entrypoint (BuilderWithPkg.path). */
  requirePath: string;
  buildOptions: BuildOptions;
  /** Fully-computed environment for the child (replaces the parent's per-build env mutation). */
  env: NodeJS.ProcessEnv;
  cwd: string;
  /**
   * Whether this build has a configured pre-deploy command. When true, the worker wires a
   * `registerPreDeploy` into buildOptions and stays alive after the build so its callback can be
   * run later via the returned `runPreDeploy`.
   */
  expectsPreDeploy?: boolean;
  /**
   * Called with the trace events the builder recorded in the worker (on success and failure),
   * so the caller can report them under its `vc.builder` span (via Span.reportChildEvents, which
   * reparents the roots). Kept as a callback rather than a return value so failed builds still
   * surface their spans without polluting the thrown error.
   */
  reportTraceEvents?: (events: TraceEvent[]) => void;
}

/**
 * Fork a worker, run one build, and return the deserialized result. `buildOptions.span` is
 * dropped (a class instance that can't be serialized); the caller keeps its own tracing.
 *
 * The child inherits stdout/stderr so its build output reaches the terminal directly, matching
 * the previous in-process behavior.
 */
export async function buildInSubprocess({
  requirePath,
  buildOptions,
  env,
  cwd,
  expectsPreDeploy,
  reportTraceEvents,
}: BuildInSubprocessOptions): Promise<BuildInSubprocessResult> {
  const workerPath = join(__dirname, 'builder-worker.cjs');

  // `span` is a class instance with methods — not serializable. Send everything else.
  const { span: _span, ...serializableBuildOptions } = buildOptions;

  const child = fork(workerPath, [], {
    cwd,
    execArgv: [],
    env,
  });

  const teardown = () => {
    if (child.connected) child.disconnect();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
    }
    output.debug(`Build subprocess for "${buildOptions.entrypoint}" finished`);
  };

  // Wait for the worker's `ready` handshake before sending the build request.
  await new Promise<void>((resolve, reject) => {
    child.once('message', data => {
      if (
        data !== null &&
        typeof data === 'object' &&
        (data as { type: string }).type !== 'ready'
      ) {
        reject(new Error('Did not get "ready" event from builder'));
      } else {
        resolve();
      }
    });
    child.once('error', reject);
  });

  try {
    child.send({
      type: 'build',
      requirePath,
      buildOptions: serializableBuildOptions,
      expectsPreDeploy: Boolean(expectsPreDeploy),
    });

    const message = await new Promise<
      BuildMessageResult & { result: BuildResultV2 | BuildResultV3 }
    >((resolve, reject) => {
      function onMessage(msg: BuildMessageResult) {
        cleanup();
        if (msg.type === 'buildResult') {
          // Report spans the build recorded (even on failure) so forked builds keep trace
          // fidelity. Done here, not by attaching to the error, so the error stays a clean
          // object when serialized into builds.json.
          if (msg.traceEvents) reportTraceEvents?.(msg.traceEvents);
          if (msg.result) {
            resolve(
              msg as BuildMessageResult & {
                result: BuildResultV2 | BuildResultV3;
              }
            );
          } else {
            reject(Object.assign(new Error(), msg.error));
          }
        } else {
          reject(new Error(`Got unexpected message type: ${msg.type}`));
        }
      }
      function onExit(code: number | null, signal: string | null) {
        cleanup();
        reject(
          new Error(
            `Builder exited with ${signal || code} before sending build result`
          )
        );
      }
      function cleanup() {
        child.removeListener('close', onExit);
        child.removeListener('message', onMessage);
      }
      child.on('close', onExit);
      child.on('message', onMessage);
    });

    const buildResult = message.result;
    rehydrateResult(buildResult);
    const diagnostics = message.diagnostics
      ? rehydrateDiagnostics(message.diagnostics)
      : undefined;

    if (!message.hasPreDeploy) {
      teardown();
      return { buildResult, diagnostics };
    }

    // The build registered a pre-deploy callback. Keep the worker alive and hand back a
    // trigger the caller runs after all builds succeed; it runs the callback in the worker
    // (with the env it captured) and then tears the worker down.
    const runPreDeploy = () =>
      new Promise<void>((resolve, reject) => {
        function onMessage(msg: PreDeployMessageResult) {
          if (msg.type !== 'preDeployResult') return;
          cleanup();
          // Report spans the pre-deploy step recorded (success or failure) before settling.
          if (msg.traceEvents) reportTraceEvents?.(msg.traceEvents);
          if (msg.error) reject(Object.assign(new Error(), msg.error));
          else resolve();
        }
        function onExit(code: number | null, signal: string | null) {
          cleanup();
          reject(
            new Error(
              `Builder exited with ${signal || code} before running pre-deploy`
            )
          );
        }
        function cleanup() {
          child.removeListener('close', onExit);
          child.removeListener('message', onMessage);
          teardown();
        }
        child.on('close', onExit);
        child.on('message', onMessage);
        child.send({ type: 'runPreDeploy' });
      });

    return { buildResult, diagnostics, runPreDeploy };
  } catch (err) {
    teardown();
    throw err;
  }
}
