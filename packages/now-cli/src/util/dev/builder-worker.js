/**
 * This file gets copied out of the `pkg` snapshot filesystem into the `now dev`
 * builder cache directory, so it's very important that it does not rely on any
 * modules from npm that would not be available in that directory (so basically,
 * only Now builders and `@now/build-utils`.
 */
const { FileFsRef } = require('@now/build-utils');

process.on('unhandledRejection', err => {
  console.error('Exiting builder due to build error:');
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
  const { builderName, buildParams } = message;
  const builder = require(builderName);

  // Convert the `files` to back into `FileFsRef` instances
  for (const name of Object.keys(buildParams.files)) {
    const ref = Object.assign(
      Object.create(FileFsRef.prototype),
      buildParams.files[name]
    );
    buildParams.files[name] = ref;
  }

  const result = await builder.build(buildParams);

  // `@now/next` sets this, but it causes "Converting circular
  // structure to JSON" errors, so delete the property...
  delete result.childProcesses;

  process.send({ type: 'buildResult', result });
}

process.send({ type: 'ready' });
