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
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

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
// IPC. JSON-serializing a large Buffer amplifies memory badly (each byte becomes an array
// element), which can OOM the process.
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

process.on('message', onMessage);

function onMessage(message) {
  if (message && message.type === 'runPreDeploy') {
    runPreDeploy();
    return;
  }
  processMessage(message).catch(err => {
    Object.defineProperty(err, 'message', { enumerable: true });
    Object.defineProperty(err, 'stack', { enumerable: true });
    process.removeListener('message', onMessage);
    // Ship whatever spans were recorded before the failure so failed builds still trace.
    process.send(
      { type: 'buildResult', error: err, traceEvents: drainTraceEvents() },
      () => process.exit(1)
    );
  });
}

function runPreDeploy() {
  // The pre-deploy callback records its own spans (e.g. `vc.builder.preDeploy`) into the (now
  // drained) buffer; ship those back so they nest under the parent's `vc.builder` span.
  Promise.resolve()
    .then(() => preDeployCallback?.())
    .then(
      () =>
        process.send(
          { type: 'preDeployResult', traceEvents: drainTraceEvents() },
          () => process.exit(0)
        ),
      err => {
        Object.defineProperty(err, 'message', { enumerable: true });
        Object.defineProperty(err, 'stack', { enumerable: true });
        process.send(
          {
            type: 'preDeployResult',
            error: err,
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

  const result = await builder.build(buildOptions);

  // `@vercel/next` sets this; it is circular and cannot be JSON-serialized.
  delete result.childProcesses;

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

  // Prepare each output for IPC. Lambda/EdgeFunction carry a `files` map; Prerender wraps a
  // `lambda` (with its own `files`) and a `fallback` file. serializeFiles only spills
  // oversized FileBlob Buffers to temp files — everything else rides IPC as-is.
  const serializeOutput = (output, dedup) => {
    if (!output || typeof output !== 'object') return;
    if (output.type === 'Lambda' || output.type === 'EdgeFunction') {
      serializeFiles(output.files);
    } else if (output.type === 'Prerender') {
      // A single Lambda instance is routinely shared as the `.lambda` of many
      // Prerender outputs (e.g. `@vercel/next` groups prerendered/ISR routes and
      // an HTML prerender with its `.rsc` data prerender onto one Lambda). That
      // shared identity — which writeBuildResult uses to emit a symlink instead of
      // a duplicate function — is only preserved across IPC if we dedup nested
      // lambdas too (`dedup` is provided for the V2 output map). Without it every
      // prerender route ships a full copy of the same function.
      if (output.lambda) {
        const deduped = dedup ? dedup(output.lambda) : output.lambda;
        if (deduped !== output.lambda) {
          output.lambda = deduped;
        } else {
          serializeFiles(output.lambda.files);
        }
      }
      if (output.fallback) serializeFiles({ fallback: output.fallback });
    }
  };

  // Build Output API results (`{ buildOutputPath }`) have no in-memory `output` to serialize —
  // their outputs live on disk and the parent reads them from there.
  if (concrete.output) {
    if (effectiveVersion === 3) {
      serializeOutput(concrete.output);
    } else {
      // A V2 output map can reference the SAME Lambda/EdgeFunction instance in
      // multiple places — under multiple top-level keys, and (crucially) as the
      // nested `.lambda` of many Prerender outputs. writeBuildResult relies on that
      // shared identity to emit a symlink instead of a duplicate function. JSON/IPC
      // would clone each reference into a distinct object and break the dedup, so on
      // the first time we see an object we tag it with a `__sharedId` and every later
      // reference is replaced by a `{ __sharedRef: <id> }` sentinel the parent
      // resolves back to the one instance after deserialization.
      const seen = new Map();
      let nextSharedId = 0;
      // Returns the value unchanged on first encounter (tagging it so the parent can
      // register it by id), or a sentinel referencing that first encounter.
      const dedup = value => {
        const existingId = seen.get(value);
        if (existingId !== undefined) {
          return { __sharedRef: existingId };
        }
        const id = nextSharedId++;
        seen.set(value, id);
        value.__sharedId = id;
        return value;
      };
      for (const key of Object.keys(concrete.output)) {
        const value = concrete.output[key];
        if (value && typeof value === 'object') {
          const deduped = dedup(value);
          if (deduped !== value) {
            concrete.output[key] = deduped;
            continue;
          }
        }
        serializeOutput(value, dedup);
      }
    }
  }

  // Collect diagnostics from the same builder instance that just built. diagnostics() returns
  // a Files map (e.g. { 'package-manifest.json': FileBlob }); serialize it like build outputs so
  // the parent can validate/write it. Traced here in the worker (the span rides back with the
  // rest), and failures must not fail the build.
  let diagnostics;
  try {
    diagnostics = await buildOptions.span
      .child('vc.builder.diagnostics')
      .trace(
        async () => (await builder.diagnostics?.(buildOptions)) || undefined
      );
    if (diagnostics) serializeFiles(diagnostics);
  } catch (err) {
    // Surface to the worker's stderr (piped/inherited to the parent) but don't fail the build.
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(`[vc] collecting diagnostics failed: ${err}`);
    diagnostics = undefined;
  }

  // Stop the worker root span so it (and its recorded children) are collected before we drain
  // and ship the events for the parent to report under its `vc.builder` span.
  buildOptions.span.stop();

  // With a pending pre-deploy the worker stays alive to run the callback (which holds the
  // builder-computed env) when the parent later sends `runPreDeploy`; the parent tears the
  // worker down once done. Without one, the parent kills the worker as soon as it has the result.
  // Drain the collected events here so the deferred pre-deploy step ships only what it records.
  const hasPreDeploy = Boolean(preDeployCallback);
  process.send({
    type: 'buildResult',
    result,
    diagnostics,
    hasPreDeploy,
    traceEvents: drainTraceEvents(),
  });
}

process.send({ type: 'ready' });
