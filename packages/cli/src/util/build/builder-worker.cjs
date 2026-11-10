/**
 * Forked worker that runs a single builder's `build()` (and `diagnostics()`) in its own
 * process for `vc build`. Running each build out-of-process gives it isolated stdout/stderr
 * — which the parent pipes and can prefix per line with the service name — and isolated
 * env, which is a prerequisite for running builds in parallel.
 *
 * This is modeled on the `vc dev` worker (../dev/builder-worker.cjs) and shares its IPC
 * contract (`ready` / `build` / `buildResult`), but it serializes Lambda/EdgeFunction outputs
 * by preserving their `files` map (as FileFsRef/FileBlob descriptors) instead of zipping them.
 * `vc build`'s writeLambda relies on `lambda.files` for the FileFsRef-by-reference optimization,
 * the `filePathMap`, and `standalone` symlink handling — all of which are lost if we ship only
 * a `zipBuffer` the way the dev worker does.
 *
 * Like the dev worker, this file is copied verbatim into `dist` next to the compiled `build`
 * command, so it must only `require` `@vercel/build-utils` and Node built-ins.
 */
const { FileFsRef, Span } = require('@vercel/build-utils');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

// Trace events produced by the builder's own spans (children of buildOptions.span) are collected
// here and shipped back to the parent, which reports them under its `vc.builder` span so forked
// builds keep full trace fidelity. Included on both success and error messages so a failed build
// still contributes the spans it managed to record. Emptied after each send so a later phase
// (the deferred pre-deploy step) ships only the events it newly recorded.
let collectedTraceEvents = [];
const traceReporter = { report: event => collectedTraceEvents.push(event) };
// Take the events collected so far and reset the buffer, so the next send starts fresh.
function drainTraceEvents() {
  const events = collectedTraceEvents;
  collectedTraceEvents = [];
  return events;
}

// Above this size a FileBlob's Buffer is written to a temp file rather than sent inline over
// IPC. Even under structured-clone serialization the whole Buffer is copied into a single IPC
// message; spilling very large blobs to disk bounds that per-message memory spike.
const BLOB_FILE_THRESHOLD = 256 * 1024 * 1024; // 256MB

process.on('unhandledRejection', err => {
  // biome-ignore lint/suspicious/noConsole: intentional console usage
  console.error('Exiting builder due to build error:');
  // biome-ignore lint/suspicious/noConsole: intentional console usage
  console.error(err);
  process.exit(1);
});

// A builder may register a pre-deploy callback during build(). The CLI runs pre-deploys only
// after every build succeeds, so we hold the callback here and run it when the parent sends a
// `runPreDeploy` message, keeping the builder-computed env the callback captured.
let preDeployCallback;

// Key under which processMessage stashes the diagnostics it collected for a build that threw, so
// the error path in onMessage can ship them. A Symbol, so `serializeError` (which copies own
// property *names*) can't fold it into the error the parent writes into builds.json.
const DIAGNOSTICS = Symbol('diagnostics');

process.on('message', onMessage);

// Convert an Error into a plain object with all its properties enumerable. Structured-clone IPC
// reconstructs a native Error but keeps only `name`/`message`/`stack` — custom props a builder
// sets (e.g. NowBuildError's `code`/`link`, which the parent writes into builds.json) would be
// dropped. A plain object clones losslessly; the parent rebuilds an Error from it.
function serializeError(err) {
  if (!err || typeof err !== 'object') return err;
  const plain = { name: err.name, message: err.message, stack: err.stack };
  for (const key of Object.getOwnPropertyNames(err)) {
    plain[key] = err[key];
  }
  return plain;
}

function onMessage(message) {
  if (message && message.type === 'runPreDeploy') {
    runPreDeploy();
    return;
  }
  processMessage(message).catch(err => {
    process.removeListener('message', onMessage);
    process.send(
      {
        type: 'buildResult',
        error: serializeError(err),
        // A failed build is exactly when diagnostics matter most, so ship whatever the builder
        // recorded before it threw. `processMessage` collects them in a `finally` and stashes
        // them on the error (see DIAGNOSTICS) on its way out.
        diagnostics: err?.[DIAGNOSTICS],
        traceEvents: drainTraceEvents(),
      },
      () => process.exit(1)
    );
  });
}

function runPreDeploy() {
  Promise.resolve()
    .then(() => preDeployCallback?.())
    .then(
      () =>
        process.send(
          { type: 'preDeployResult', traceEvents: drainTraceEvents() },
          () => process.exit(0)
        ),
      err => {
        process.send(
          {
            type: 'preDeployResult',
            error: serializeError(err),
            traceEvents: drainTraceEvents(),
          },
          () => process.exit(1)
        );
      }
    );
}

// Re-prototype a plain object sent over IPC back into a FileFsRef instance.
function rehydrateFile(obj) {
  return Object.assign(Object.create(FileFsRef.prototype), obj);
}

// Serialize a Files map for transport. FileFsRef entries are cheap path references and pass
// through as-is; FileBlob entries carry a Buffer, which is left inline unless it exceeds the
// threshold, in which case it is spilled to a temp file the parent reads and unlinks.
function serializeFiles(files) {
  if (!files) return files;
  for (const name of Object.keys(files)) {
    const file = files[name];
    if (file && file.type === 'FileBlob' && Buffer.isBuffer(file.data)) {
      if (file.data.length > BLOB_FILE_THRESHOLD) {
        const tmp = path.join(
          os.tmpdir(),
          `vercel-build-blob-${crypto.randomBytes(8).toString('hex')}`
        );
        fs.writeFileSync(tmp, file.data);
        file.dataPath = tmp;
        delete file.data;
      }
    }
  }
  return files;
}

// Collect diagnostics from the same builder instance that just built. diagnostics() returns a
// Files map (e.g. { 'package-manifest.json': FileBlob }); serialize it like build outputs so the
// parent can validate/write it. Traced here in the worker (the span rides back with the rest), and
// failures must not propagate — diagnostics are best-effort and never fail (or mask) a build.
async function collectDiagnostics(builder, buildOptions) {
  try {
    const diagnostics = await buildOptions.span
      .child('vc.builder.diagnostics')
      .trace(
        async () => (await builder.diagnostics?.(buildOptions)) || undefined
      );
    if (diagnostics) serializeFiles(diagnostics);
    return diagnostics;
  } catch (err) {
    // Surface to the worker's stderr (piped/inherited to the parent) but don't fail the build.
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(`[vc] collecting diagnostics failed: ${err}`);
    return undefined;
  }
}

async function processMessage(message) {
  const { requirePath, buildOptions, expectsPreDeploy } = message;
  const builder = require(requirePath);

  // `files` arrive as plain objects — turn them back into FileFsRef instances the builder expects.
  for (const name of Object.keys(buildOptions.files)) {
    buildOptions.files[name] = rehydrateFile(buildOptions.files[name]);
  }

  // Give the builder a span backed by our collecting reporter so the child spans it records are
  // shipped back to the parent. The parent dropped the real Span (a class instance can't cross
  // IPC), so we reconstruct one here; it has no parent id — the parent reparents this root under
  // its own `vc.builder` span via Span.reportChildEvents when the events are reported.
  buildOptions.span = new Span({
    name: 'vc.builder.worker',
    reporter: traceReporter,
  });

  // Capture any pre-deploy callback the builder registers during build(); the parent triggers
  // it later via a `runPreDeploy` message. Only wired when the parent said a pre-deploy command
  // is configured for this build.
  if (expectsPreDeploy) {
    buildOptions.registerPreDeploy = callback => {
      preDeployCallback = callback;
    };
  }

  // Build in a try/finally so diagnostics are collected on both outcomes, mirroring `doBuild`'s
  // handling on the in-process path: a build that threw is exactly when its diagnostics matter
  // most.
  let result;
  let diagnostics;
  let buildError;
  try {
    result = await builder.build(buildOptions);
  } catch (err) {
    buildError = err;
    throw err;
  } finally {
    diagnostics = await collectDiagnostics(builder, buildOptions);
    // A failed build has no result message to carry the diagnostics, so stash them on the error
    // for `onMessage` to ship. Symbol-keyed, so `serializeError` (which copies own property
    // *names*) can't fold them into the error the parent writes into builds.json.
    if (buildError && typeof buildError === 'object') {
      Object.defineProperty(buildError, DIAGNOSTICS, { value: diagnostics });
    }
    // Stop the worker root span so it (and its recorded children) are collected before the events
    // are drained and shipped for the parent to report under its `vc.builder` span.
    buildOptions.span.stop();
  }

  // Locate the concrete V2/V3 result and its version WITHOUT unwrapping the wire payload:
  // the parent (and writeBuildResult) still expect a BuildResultVX wrapper for
  // `builder.version === -1` builders, so we serialize the inner outputs in place and send
  // the original `result` back untouched in shape.
  let effectiveVersion = builder.version;
  let concrete = result;
  if (builder.version === -1) {
    effectiveVersion = result.resultVersion;
    concrete = result.result;
  }

  // The IPC channel uses `serialization: 'advanced'` (V8 structured clone), which preserves
  // Buffers, cycles (e.g. `@vercel/next`'s `result.childProcesses`), and shared object identity
  // — the same Lambda referenced by many V2 keys or many `Prerender.lambda` fields arrives as
  // ONE instance, which writeBuildResult relies on for symlink dedup. So the only remaining job
  // here is spilling oversized FileBlob Buffers to temp files (see serializeFiles). We still walk
  // every reachable `files` map, using `seen` so a shared Lambda is spilled at most once.
  const seen = new Set();
  const serializeOutput = output => {
    if (!output || typeof output !== 'object' || seen.has(output)) return;
    seen.add(output);
    if (output.type === 'Lambda' || output.type === 'EdgeFunction') {
      serializeFiles(output.files);
    } else if (output.type === 'Prerender') {
      // Prerender wraps a `lambda` (with its own `files`) and a `fallback` file.
      if (output.lambda) serializeOutput(output.lambda);
      if (output.fallback) serializeFiles({ fallback: output.fallback });
    }
  };

  // Build Output API results (`{ buildOutputPath }`) have no in-memory `output` to serialize —
  // their outputs live on disk and the parent reads them from there.
  if (concrete.output) {
    if (effectiveVersion === 3) {
      serializeOutput(concrete.output);
    } else {
      for (const value of Object.values(concrete.output)) {
        serializeOutput(value);
      }
    }
  }

  // With a pending pre-deploy the worker stays alive to run the callback (which holds the
  // builder-computed env) when the parent later sends `runPreDeploy`; the parent tears the
  // worker down once done. Without one, the parent kills the worker as soon as it has the result.
  // Drain the collected events here so the deferred pre-deploy step ships only what it records.
  const hasPreDeploy = Boolean(preDeployCallback);
  process.send({
    type: 'buildResult',
    result,
    // The concrete result's shape (single V3 output vs. a V2 map of named outputs) can't be
    // inferred reliably from the payload — a V2 map may legitimately hold a key named `type`
    // — so tell the parent which one it is instead of making it guess.
    outputVersion: effectiveVersion,
    diagnostics,
    hasPreDeploy,
    // Builders share state through `meta` (e.g. runNpmInstall's dedup set). This worker had a
    // structured-clone copy, so send it back for the parent to merge into the shared meta.
    meta: buildOptions.meta,
    traceEvents: drainTraceEvents(),
  });
}

process.send({ type: 'ready' });
