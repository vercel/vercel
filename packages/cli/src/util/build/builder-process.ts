import { type ChildProcess, fork } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  type BuildResultV2,
  type BuildResultV3,
  Lambda,
  FileBlob,
  FileFsRef,
  FileRef,
  type TraceEvent,
  type Meta,
} from '@vercel/build-utils';
import output from '../../output-manager';
import { BuildRunner } from './build-runner';

/**
 * Runs a builder's `build()` in a forked child process for `vc build`, modeled after the
 * builder worker used by `vc dev`.
 *
 * Why out-of-process: a child process has its own isolated stdout/stderr and env,
 * unlocking accurate attribution of every output line the build produces — including output
 * from subprocesses the builder spawns with `stdio: 'inherit'` (e.g. `next build`), which write
 * to the child's real file descriptors - and safe parallel builds in the future.
 *
 * The child side lives in `./builder-worker.cjs`. This module owns the parent half of the IPC
 * contract: send `{ type: 'build', requirePath, buildOptions }`, await `{ type: 'buildResult',
 * result | error }`, then re-prototype the File/Lambda outputs into real instances. The channel
 * uses `serialization: 'advanced'` (V8 structured clone), so Buffers, cycles, and shared object
 * identity survive transport — only class prototypes must be restored on this side.
 */

/**
 * A serialized FileBlob. Under structured-clone IPC its `data` arrives as a real Buffer (or a
 * plain string, passed through as-is), or is absent when the Buffer was too large and was
 * spilled to `dataPath`.
 */
interface SerializedFileBlob {
  type: 'FileBlob';
  data?: string | Buffer;
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
  /** Builders share state via a meta object, so this needs sending back after the build. */
  meta?: Meta;
  /** A plain object form of the worker's Error (all props enumerable); see `toError`. */
  error?: object;
}

interface PreDeployMessageResult {
  type: 'preDeployResult';
  /** Trace events the pre-deploy step recorded (e.g. `vc.builder.preDeploy`). */
  traceEvents?: TraceEvent[];
  /** A plain object form of the worker's Error (all props enumerable); see `toError`. */
  error?: object;
}

/**
 * Coerce an error received from the worker into a real Error. Under structured-clone IPC it
 * already arrives as an Error instance (with `message`/`stack` preserved), so it's returned
 * as-is; anything else is wrapped so downstream `toEnumerableError`/`.message` access is safe.
 */
function toError(error: object | undefined): Error {
  if (error instanceof Error) return error;
  return Object.assign(new Error(), error);
}

/**
 * Merge a worker's post-build `meta` clone back into the shared parent `meta`.
 *
 * Key-wise commutative so concurrent merge-backs never lose updates: a plain
 * `Object.assign` is last-write-wins, which under parallel builds would replace e.g. the parent's
 * `runNpmInstallSet` with whichever worker's clone finished last, silently dropping the union and
 * re-enabling duplicate installs for later builds. Rules:
 * - two `Set`s union in place;
 * - a `true` already in the parent is a sticky latch (e.g. `compiledToCommonJS`) that a worker's
 *   stale `false`/`undefined` snapshot must not clear;
 * - everything else is last-write-wins — acceptable, because two concurrent builds could never
 *   have observed each other's writes in-process either.
 */
export function mergeWorkerMeta(target: Meta, workerMeta: Meta): void {
  for (const [key, value] of Object.entries(workerMeta)) {
    const existing = target[key];
    if (existing instanceof Set && value instanceof Set) {
      for (const entry of value) {
        existing.add(entry);
      }
    } else if (existing === true && typeof value !== 'object') {
      // sticky-true latch; keep it
    } else {
      target[key] = value;
    }
  }
}

/**
 * Forward each line of `source` to `destination` prefixed with the build's tag, buffering
 * partial chunks so concurrent workers interleave line-atomically instead of mid-line.
 */
function prefixLines(
  source: NodeJS.ReadableStream,
  destination: NodeJS.WriteStream,
  prefix: string
): void {
  let pending = '';
  source.setEncoding('utf8');
  source.on('data', (chunk: string) => {
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      destination.write(`${prefix}${line}\n`);
    }
  });
  source.on('end', () => {
    if (pending) {
      destination.write(`${prefix}${pending}\n`);
    }
  });
}

/** A builder's rehydrated diagnostics: a map of filename → File instance. */
export type BuilderDiagnostics = Record<string, FileFsRef | FileBlob | FileRef>;

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
      // Large Buffer that the worker spilled to a temp file; read it back and clean up.
      blob.data = readFileSync(obj.dataPath);
      try {
        unlinkSync(obj.dataPath);
      } catch {
        // best-effort temp cleanup
      }
      delete (blob as { dataPath?: string }).dataPath;
    }
    // Otherwise `data` (a string or a real Buffer) made it across structured-clone IPC intact.
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

/**
 * Re-prototype a single Lambda/EdgeFunction/Prerender/File output in place. Under structured-
 * clone IPC the object graph — including Lambdas shared across many outputs — arrives intact;
 * we only need to restore prototypes. Rehydrating in place keeps shared instances identical,
 * which writeBuildResult relies on for symlink dedup. `seen` guards against re-visiting a
 * shared instance (and against cycles).
 */
function rehydrateOutput(output: unknown, seen: Set<object>): void {
  if (!output || typeof output !== 'object' || seen.has(output)) return;
  seen.add(output);
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
    // Prerender wraps a Lambda (routinely shared across many Prerenders) and a fallback File.
    if (obj.lambda) rehydrateOutput(obj.lambda, seen);
    if (obj.fallback) rehydrateOutput(obj.fallback, seen);
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
  const seen = new Set<object>();
  if ((output as { type?: string }).type) {
    // V3: a single output.
    rehydrateOutput(output, seen);
  } else {
    // V2: a map of named outputs. A Lambda/EdgeFunction may appear under many keys and as the
    // nested `.lambda` of many Prerenders; structured clone kept those as one instance, so a
    // single seen-guarded walk re-prototypes each exactly once and preserves shared identity.
    for (const value of Object.values(output as Record<string, unknown>)) {
      rehydrateOutput(value, seen);
    }
  }
}

/** Runs a builder in a forked worker process. */
export class SubprocessBuildRunner extends BuildRunner {
  private child?: ChildProcess;

  private diagnosticsResult?: BuilderDiagnostics;

  /**
   * Fork a worker, run one build, and return the deserialized result. `buildOptions.span` is
   * dropped (a class instance that can't be serialized); the caller keeps its own tracing.
   *
   * Sequentially, the child inherits stdout/stderr so its build output reaches the terminal
   * directly, matching the previous in-process behavior. When the scheduler runs builds
   * concurrently it sets `ctx.outputPrefix`, and the child's stdout/stderr are piped through a
   * per-line tagger instead — interleaved output from parallel workers stays attributable.
   * When the build registers a pre-deploy command, the worker is kept alive: its
   * `registerPreDeploy` callback runs the command in the worker later, when the command invokes
   * the deferred callback. Teardown is owned by the caller (via `teardown()`), so a kept-alive
   * worker is released even if that deferred callback is never reached.
   */
  async build(): Promise<BuildResultV2 | BuildResultV3> {
    const workerPath = join(__dirname, 'builder-worker.cjs');

    const { outputPrefix } = this.ctx;
    const child = fork(workerPath, [], {
      cwd: this.ctx.cwd,
      execArgv: [],
      // A per-build env (set by the concurrent scheduler) isolates each service's
      // VERCEL_PROJECT_SETTINGS_* / service-URL vars into its own worker, so parallel
      // builds don't race on a shared `process.env`. Falls back to the parent env.
      env: this.ctx.env ?? process.env,
      // V8 structured clone (not the default JSON) so the build result rides across with its
      // Buffers, cycles (e.g. `@vercel/next`'s `childProcesses`), and shared object identity
      // (one Lambda referenced by many outputs stays one instance) intact.
      serialization: 'advanced',
      ...(typeof outputPrefix === 'string'
        ? { stdio: ['inherit', 'pipe', 'pipe', 'ipc'] as const }
        : {}),
    });
    this.child = child;

    if (typeof outputPrefix === 'string') {
      if (child.stdout) prefixLines(child.stdout, process.stdout, outputPrefix);
      if (child.stderr) prefixLines(child.stderr, process.stderr, outputPrefix);
    }

    // Wait for the worker's `ready` handshake before sending the build request.
    await new Promise<void>((resolve, reject) => {
      function onMessage(data: unknown) {
        cleanup();
        if (
          data !== null &&
          typeof data === 'object' &&
          (data as { type: string }).type !== 'ready'
        ) {
          reject(new Error('Did not get "ready" event from builder'));
        } else {
          resolve();
        }
      }
      function onError(err: Error) {
        cleanup();
        reject(err);
      }
      function onExit(code: number | null, signal: string | null) {
        // The worker exited before sending `ready` (e.g. crashed on load). `error` only
        // fires for spawn/send failures, not for a process that started and then exited, so
        // without this the handshake would hang forever.
        cleanup();
        reject(
          new Error(
            `Builder exited with ${signal || code} before sending ready event`
          )
        );
      }
      function cleanup() {
        child.removeListener('message', onMessage);
        child.removeListener('error', onError);
        child.removeListener('close', onExit);
      }
      child.on('message', onMessage);
      child.on('error', onError);
      child.on('close', onExit);
    });

    try {
      const message = await this._runBuild();

      const buildResult = message.result;
      rehydrateResult(buildResult);

      this.diagnosticsResult = message.diagnostics
        ? rehydrateDiagnostics(message.diagnostics)
        : undefined;

      // The worker mutated a structured-clone copy of `meta` (builders share state through it,
      // e.g. `runNpmInstallSet` for install dedup). Merge those mutations back into the shared
      // `meta` so later builds see them — the cross-process equivalent of the in-process path
      // sharing `meta` by reference. Shallow by design: builder meta state is flat keys/Sets.
      // Commutative (Sets union) so concurrent workers' merge-backs never clobber each other.
      if (this.ctx.buildOptions.meta && message.meta) {
        mergeWorkerMeta(this.ctx.buildOptions.meta, message.meta);
      }

      if (message.hasPreDeploy) {
        // The build registered a pre-deploy callback, so the worker is kept alive to run it.
        // Wire it to the shared pre-deploy mechanism (same as in-process builds); it runs the
        // callback in the worker, with the builder-computed env it captured, then releases the
        // worker.
        // Note: The caller should also do an unconditional teardown of all runners as a safety
        // net for when this callback never runs (e.g. a sibling build threw first).
        this.ctx.buildOptions.registerPreDeploy?.(() =>
          this._runPreDeploy().finally(() => this.teardown())
        );
      } else {
        this.teardown();
      }

      return buildResult;
    } catch (err) {
      this.teardown();
      throw err;
    }
  }

  private _runBuild() {
    const child = this.child;
    if (!child) {
      throw new Error('subprocess not initialised before build');
    }

    // Structured clone throws on functions and class instances, so drop the fields that carry
    // them: `span` (a Span instance — the worker reconstructs its own), and `registerPreDeploy`
    // (a callback — the worker wires its own from `expectsPreDeploy`). `buildCallback` never
    // reaches this path (canBuildInSubprocess excludes builds that set it). Everything else is
    // plain data and clones fine.
    const {
      span: _span,
      registerPreDeploy: _registerPreDeploy,
      ...serializableBuildOptions
    } = this.ctx.buildOptions;
    const builderSpan = this.ctx.builderSpan;

    child.send({
      type: 'build',
      requirePath: this.ctx.requirePath,
      buildOptions: serializableBuildOptions,
      expectsPreDeploy: Boolean(this.ctx.expectsPreDeploy),
    });

    return new Promise<
      BuildMessageResult & { result: BuildResultV2 | BuildResultV3 }
    >((resolve, reject) => {
      function onMessage(msg: BuildMessageResult) {
        cleanup();
        if (msg.type === 'buildResult') {
          // Report spans the build recorded (even on failure) so forked builds keep trace
          // fidelity. Done here, not by attaching to the error, so the error stays a clean
          // object when serialized into builds.json.
          if (msg.traceEvents) {
            builderSpan?.reportChildEvents(msg.traceEvents);
          }
          if (msg.result) {
            resolve(
              msg as BuildMessageResult & {
                result: BuildResultV2 | BuildResultV3;
              }
            );
          } else {
            reject(toError(msg.error));
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
        child!.removeListener('close', onExit);
        child!.removeListener('message', onMessage);
      }
      child.once('close', onExit);
      child.once('message', onMessage);
    });
  }

  private _runPreDeploy() {
    const child = this.child;
    if (!child) {
      throw new Error('subprocess not initialised before predeploy');
    }

    const builderSpan = this.ctx.builderSpan;

    return new Promise<void>((resolve, reject) => {
      function onMessage(msg: PreDeployMessageResult) {
        if (msg.type !== 'preDeployResult') return;
        cleanup();
        // Report spans the pre-deploy step recorded (success or failure) before settling.
        if (msg.traceEvents) {
          builderSpan?.reportChildEvents(msg.traceEvents);
        }
        if (msg.error) {
          reject(toError(msg.error));
        } else resolve();
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
        child!.removeListener('close', onExit);
        child!.removeListener('message', onMessage);
      }
      child.on('close', onExit);
      child.on('message', onMessage);

      child.send({ type: 'runPreDeploy' });
    });
  }

  async diagnostics(): Promise<BuilderDiagnostics | undefined> {
    return this.diagnosticsResult;
  }

  teardown(): void {
    const { child } = this;
    if (!child) return;

    if (child.connected) child.disconnect();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
    }
    output.debug(
      `Build subprocess for "${this.ctx.buildOptions.entrypoint}" finished`
    );

    // Clear the reference so any later teardown() call is a no-op.
    this.child = undefined;
  }
}
