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
import {
  BuildRunner,
  type BuilderDiagnostics,
} from '@vercel-internals/cli-builder-integration/build-runner';
import output from '../../output-manager';

/**
 * Runs a builder's `build()` in a forked child process for `vc build`, modeled after the
 * builder worker used by `vc dev`.
 *
 * Why out-of-process: a child process has its own isolated stdout/stderr and env,
 * unlocking accurate attribution of every output line the build produces — including output
 * from subprocesses the builder spawns with `stdio: 'inherit'` (e.g. `next build`), which write
 * to the child's real file descriptors - and safe parallel builds.
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
  /**
   * Builder API version of the concrete result inside `result` (reaching through a
   * BuildResultVX wrapper), i.e. whether `output` is a single V3 output or a V2 map of named
   * outputs. Reported by the worker, which knows the builder's version, because the shape
   * can't be told apart reliably from the payload alone — a V2 map may hold a key named `type`.
   */
  outputVersion?: 2 | 3;
  /**
   * Serialized Files returned by the builder's `diagnostics()`, if any. Sent alongside `error`
   * too — a build that threw still reports the diagnostics it recorded before failing.
   */
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

export type { BuilderDiagnostics };

/**
 * Merge a worker's post-build `meta` clone back into the shared parent `meta`.
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
 * Whether a build can run in a forked worker:
 * - Only multi-service deployments fork for now; single-project builds stay
 *   in-process to limit the blast radius of any regression.
 * - `@vercel/static` is a built-in with no module path to `require()` in the worker.
 */
export function canBuildInSubprocess({
  hasDetectedServices,
  builderPath,
}: {
  hasDetectedServices: boolean;
  builderPath: string;
}): boolean {
  return hasDetectedServices && Boolean(builderPath);
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

/**
 * Rehydrate all outputs of a build result (V2 map or V3 single output) in place.
 *
 * `outputVersion` comes from the worker, which knows the builder's version, rather than being
 * sniffed from the payload: a V2 output map is keyed by output path, so it can legitimately
 * contain a key named `type`, which would make a shape check read the map itself as a single V3
 * output and silently skip rehydrating everything in the result.
 */
function rehydrateResult(
  result: BuildResultV2 | BuildResultV3,
  outputVersion: 2 | 3 | undefined
): void {
  // BuildResultVX (version === -1) wraps the concrete result under `.result`; the worker sends
  // the wrapper untouched, so reach through it to rehydrate the real outputs.
  const unwrapped =
    result && 'resultVersion' in result
      ? (result as unknown as { result: BuildResultV2 | BuildResultV3 }).result
      : result;
  const output = (unwrapped as { output?: unknown }).output;
  if (!output) return;
  const seen = new Set<object>();
  if (outputVersion === 3) {
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

/**
 * Prepends `[vc:service:<name>] ` to each complete line read from a child's stdout/stderr and
 * forwards it to `dest`. Buffers an unterminated trailing line until more data arrives (or the
 * `flush` on stream end), so the tag only ever lands at real line starts. Must stay in sync with
 * the tag matcher in api/build-container/container/src/utils/logging.ts.
 */
export function createServiceLinePrefixer(
  serviceName: string,
  dest: Pick<NodeJS.WriteStream, 'write'>
): { onData: (chunk: string) => void; flush: () => void } {
  const tag = `[vc:service:${serviceName}] `;
  let pending = '';
  return {
    onData(chunk: string) {
      pending += chunk;
      const newlineIndex = pending.lastIndexOf('\n');
      if (newlineIndex === -1) return;
      const complete = pending.slice(0, newlineIndex + 1);
      pending = pending.slice(newlineIndex + 1);
      const tagged = complete
        .split('\n')
        .slice(0, -1)
        .map(line => `${tag}${line}`)
        .join('\n');
      dest.write(`${tagged}\n`);
    },
    flush() {
      if (pending.length > 0) {
        dest.write(`${tag}${pending}`);
        pending = '';
      }
    },
  };
}

/** Runs a builder in a forked worker process. */
export class SubprocessBuildRunner extends BuildRunner {
  private child?: ChildProcess;

  private diagnosticsResult?: BuilderDiagnostics;

  /**
   * Records the worker's exit while it is being kept alive for a deferred pre-deploy callback.
   * A kept-alive worker sits idle (with no per-request listener attached) between build
   * completion and the deferred pre-deploy loop; if it dies in that window, its `close` event
   * fires with no listener and would otherwise be lost. Tracking it persistently lets
   * `_runPreDeploy()` fail fast instead of hanging (waiting for a `close`/`message` that will
   * never come) or crashing on `child.send()` to a dead IPC channel.
   */
  private childExit?: { code: number | null; signal: string | null };

  /**
   * Line prefixers for the child's piped stdout/stderr, present only when `ctx.serviceName` is
   * set. Flushed on each stream's `end` so a trailing partial line isn't lost.
   */
  private stdoutPrefixer?: ReturnType<typeof createServiceLinePrefixer>;

  private stderrPrefixer?: ReturnType<typeof createServiceLinePrefixer>;

  /**
   * Fork a worker, run one build, and return the deserialized result. `buildOptions.span` is
   * dropped (a class instance that can't be serialized); the caller keeps its own tracing.
   *
   * When `ctx.serviceName` is set, the child's stdout/stderr are piped so each line can be
   * prefixed with the service tag before forwarding to the terminal (covering the builder's own
   * output and any subprocess it spawns). Otherwise the child inherits stdout/stderr and writes
   * directly, matching the previous in-process behavior.
   *
   * When the build registers a pre-deploy
   * command, the worker is kept alive: its `registerPreDeploy` callback runs the command in the
   * worker later, when the command invokes the deferred callback. Teardown is owned by the caller
   * (via `teardown()`), so a kept-alive worker is released even if that deferred callback is never
   * reached.
   */
  async build(): Promise<BuildResultV2 | BuildResultV3> {
    const workerPath = join(__dirname, 'builder-worker.cjs');

    const { serviceName } = this.ctx;

    const child = fork(workerPath, [], {
      cwd: this.ctx.cwd,
      execArgv: [],
      env: this.ctx.env ?? process.env,
      // V8 structured clone (not the default JSON) so the build result rides across with its
      // Buffers, cycles (e.g. `@vercel/next`'s `childProcesses`), and shared object identity
      // (one Lambda referenced by many outputs stays one instance) intact.
      serialization: 'advanced',
      // Pipe stdout/stderr (keeping stdin inherited and the IPC channel) only when we need to
      // tag lines; otherwise inherit so output goes straight to the terminal.
      stdio: serviceName
        ? ['inherit', 'pipe', 'pipe', 'ipc']
        : ['inherit', 'inherit', 'inherit', 'ipc'],
    });
    this.child = child;

    // When piping, read the child's streams line-by-line, prefix with the service tag, and
    // forward to our own stdout/stderr. Flushed on stream end so a trailing partial line isn't lost.
    this.stdoutPrefixer = serviceName
      ? createServiceLinePrefixer(serviceName, process.stdout)
      : undefined;
    this.stderrPrefixer = serviceName
      ? createServiceLinePrefixer(serviceName, process.stderr)
      : undefined;
    if (this.stdoutPrefixer && child.stdout) {
      const prefixer = this.stdoutPrefixer;
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => prefixer.onData(chunk));
      // Flush the trailing (unterminated) line only once the stream reaches EOF, so we never
      // split a line that is still arriving. The child's stdout/stderr are piped over separate
      // file descriptors from the IPC channel, so data written just before the worker sends its
      // `buildResult` message can still be sitting in the OS pipe buffer when the parent tears
      // the worker down; flushing here (rather than in teardown) guarantees it isn't dropped.
      child.stdout.on('end', () => prefixer.flush());
    }
    if (this.stderrPrefixer && child.stderr) {
      const prefixer = this.stderrPrefixer;
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', chunk => prefixer.onData(chunk));
      child.stderr.on('end', () => prefixer.flush());
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
      rehydrateResult(buildResult, message.outputVersion);

      // `_runBuild` already captured the diagnostics the worker sent (it does so on the failure
      // path too, before rejecting).

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

        // The worker now sits idle (no per-request listeners) while the remaining services
        // build. Attach persistent liveness guards so that if it dies in this window (e.g.
        // OOM-killed), we record the exit — mirroring `vc dev`'s `createBuildProcess`, which
        // keeps a persistent `close` listener on a reused worker. Without this, the lost
        // `close` event would make `_runPreDeploy()` hang, and an `error` from `child.send()`
        // to a dead channel would go unhandled and crash the CLI.
        child.on('close', (code, signal) => {
          this.childExit ??= { code, signal };
        });
        // A late `error` (e.g. a failed `send` after the channel closed) must have a listener,
        // or Node treats it as an unhandled 'error' event and crashes the process.
        child.on('error', () => {
          this.childExit ??= { code: null, signal: null };
        });

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
    // Store the diagnostics off a `buildResult` message regardless of outcome. A failed build is
    // when diagnostics matter most, and the worker collects them before reporting the error, so
    // this must run before the promise settles — after a reject, `build()` rethrows and never
    // gets to look at the message, but the command's `finally` still calls `runner.diagnostics()`.
    const captureDiagnostics = (msg: BuildMessageResult) => {
      if (msg.diagnostics) {
        this.diagnosticsResult = rehydrateDiagnostics(msg.diagnostics);
      }
    };

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
          captureDiagnostics(msg);
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

    // The worker may have died during the idle window between build completion and this
    // deferred pre-deploy call. Its `close` event already fired (recorded in `childExit`) and
    // will not fire again, so a `close` listener attached now would never see it — the promise
    // would hang, and `child.send()` on the dead channel could emit an unhandled `error`.
    // Fail fast instead.
    if (this.childExit || !child.connected) {
      const { code = null, signal = null } = this.childExit ?? {};
      return Promise.reject(
        new Error(
          `Builder exited with ${signal || code} before running pre-deploy`
        )
      );
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
      function onError(err: Error) {
        cleanup();
        reject(err);
      }
      function cleanup() {
        child!.removeListener('close', onExit);
        child!.removeListener('message', onMessage);
        child!.removeListener('error', onError);
      }
      child.on('close', onExit);
      child.on('message', onMessage);
      child.on('error', onError);

      // `send` can throw synchronously (`ERR_IPC_CHANNEL_CLOSED`) or emit an async `error` if
      // the worker died between the liveness check above and here; the `error` listener and
      // this try/catch keep either from escaping as an unhandled rejection/crash.
      try {
        child.send({ type: 'runPreDeploy' }, (err: Error | null) => {
          if (err) onError(err);
        });
      } catch (err) {
        onError(err as Error);
      }
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
