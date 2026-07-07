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
const { FileFsRef } = require('@vercel/build-utils');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

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
    process.send({ type: 'buildResult', error: err }, () => process.exit(1));
  });
}

function runPreDeploy() {
  Promise.resolve()
    .then(() => preDeployCallback?.())
    .then(
      () => process.send({ type: 'preDeployResult' }, () => process.exit(0)),
      err => {
        Object.defineProperty(err, 'message', { enumerable: true });
        Object.defineProperty(err, 'stack', { enumerable: true });
        process.send({ type: 'preDeployResult', error: err }, () =>
          process.exit(1)
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
  const serializeOutput = output => {
    if (!output || typeof output !== 'object') return;
    if (output.type === 'Lambda' || output.type === 'EdgeFunction') {
      serializeFiles(output.files);
    } else if (output.type === 'Prerender') {
      if (output.lambda) serializeFiles(output.lambda.files);
      if (output.fallback) serializeFiles({ fallback: output.fallback });
    }
  };

  // Build Output API results (`{ buildOutputPath }`) have no in-memory `output` to serialize —
  // their outputs live on disk and the parent reads them from there.
  if (concrete.output) {
    if (effectiveVersion === 3) {
      serializeOutput(concrete.output);
    } else {
      // A V2 output map can reference the SAME Lambda/EdgeFunction instance under multiple
      // keys; writeBuildResult relies on that shared identity to emit a symlink instead of a
      // duplicate function. JSON/IPC would clone each reference into a distinct object and
      // break the dedup, so replace repeat references with a { __sharedRef: <firstKey> }
      // sentinel the parent resolves back to one instance after deserialization.
      const seen = new Map();
      for (const key of Object.keys(concrete.output)) {
        const value = concrete.output[key];
        if (value && typeof value === 'object') {
          const firstKey = seen.get(value);
          if (firstKey !== undefined) {
            concrete.output[key] = { __sharedRef: firstKey };
            continue;
          }
          seen.set(value, key);
        }
        serializeOutput(value);
      }
    }
  }

  // Collect diagnostics from the same builder instance that just built. diagnostics() returns
  // a Files map (e.g. { 'package-manifest.json': FileBlob }); serialize it like build outputs so
  // the parent can validate/write it. Failures here must not fail the build.
  let diagnostics;
  try {
    diagnostics = (await builder.diagnostics?.(buildOptions)) || undefined;
    if (diagnostics) serializeFiles(diagnostics);
  } catch (err) {
    // Surface to the worker's stderr (piped/inherited to the parent) but don't fail the build.
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(`[vc] collecting diagnostics failed: ${err}`);
    diagnostics = undefined;
  }

  // With a pending pre-deploy the worker stays alive to run the callback (which holds the
  // builder-computed env) when the parent later sends `runPreDeploy`; the parent tears the
  // worker down once done. Without one, the parent kills the worker as soon as it has the result.
  const hasPreDeploy = Boolean(preDeployCallback);
  process.send({ type: 'buildResult', result, diagnostics, hasPreDeploy });
}

process.send({ type: 'ready' });
