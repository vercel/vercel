/**
 * This file gets copied out of the `pkg` snapshot filesystem into the `vc dev`
 * builder cache directory, so it's very important that it does not rely on any
 * modules from npm that would not be available in that directory (so basically,
 * only Vercel Runtimes and `@vercel/build-utils`.
 */
const { FileFsRef } = require('@vercel/build-utils');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Threshold for writing zipBuffer to a temp file instead of sending via IPC.
// JSON serialization of large Buffers causes OOM due to memory amplification
// (each byte becomes a separate array element in the JSON representation).
const ZIP_BUFFER_FILE_THRESHOLD = 256 * 1024 * 1024; // 256MB

process.on('unhandledRejection', err => {
  // eslint-disable-next-line no-console
  console.error('Exiting builder due to build error:');
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

process.on('message', onMessage);

function onMessage(message) {
  processMessage(message).catch(err => {
    Object.defineProperty(err, 'message', { enumerable: true });
    Object.defineProperty(err, 'stack', { enumerable: true });
    process.removeListener('message', onMessage);
    process.send({ type: 'buildResult', error: err }, () => process.exit(1));
  });
}

async function processMessage(message) {
  const { requirePath, buildOptions } = message;
  const builder = require(requirePath);

  // Convert the `files` to back into `FileFsRef` instances
  for (const name of Object.keys(buildOptions.files)) {
    const ref = Object.assign(
      Object.create(FileFsRef.prototype),
      buildOptions.files[name]
    );
    buildOptions.files[name] = ref;
  }

  const result = await builder.build(buildOptions);

  // `@vercel/next` sets this, but it causes "Converting circular
  // structure to JSON" errors, so delete the property...
  delete result.childProcesses;

  // Helper to handle zipBuffer - writes to temp file if too large for IPC
  async function processLambdaOutput(output) {
    const zipBuffer = await output.createZip();
    // Delete files after creating zip to avoid OOM when serializing via IPC.
    // The zipBuffer contains all file data, so files is no longer needed.
    delete output.files;

    // For large zip buffers, write to a temp file instead of sending via IPC.
    // JSON serialization of large Buffers causes OOM because each byte becomes
    // a separate array element (e.g., {"type":"Buffer","data":[1,2,3,...]}).
    if (zipBuffer.length > ZIP_BUFFER_FILE_THRESHOLD) {
      const tempDir = os.tmpdir();
      const randomId = crypto.randomBytes(8).toString('hex');
      const zipFilePath = path.join(
        tempDir,
        `vercel-dev-lambda-${randomId}.zip`
      );
      fs.writeFileSync(zipFilePath, zipBuffer);
      output.zipBufferPath = zipFilePath;
    } else {
      output.zipBuffer = zipBuffer;
    }
  }

  if (builder.version === 3) {
    if (result.output.type === 'Lambda') {
      await processLambdaOutput(result.output);
    }
  } else {
    for (const output of Object.values(result.output)) {
      if (output.type === 'Lambda') {
        await processLambdaOutput(output);
      }
    }
  }

  process.send({ type: 'buildResult', result });
}

process.send({ type: 'ready' });
