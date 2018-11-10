const assert = require('assert');
const { ZipFile } = require('yazl');
const streamToBuffer = require('./fs/stream-to-buffer.js');

class Lambda {
  constructor({
    zipBuffer, handler, runtime, environment,
  }) {
    this.type = 'Lambda';
    this.zipBuffer = zipBuffer;
    this.handler = handler;
    this.runtime = runtime;
    this.environment = environment;
  }
}

const mtime = new Date(1540000000000);

async function createLambda({
  files, handler, runtime, environment = {},
}) {
  assert(typeof files === 'object', '"files" must be an object');
  assert(typeof handler === 'string', '"handler" is not a string');
  assert(typeof runtime === 'string', '"runtime" is not a string');
  assert(typeof environment === 'object', '"environment" is not an object');
  const zipFile = new ZipFile();

  Object.keys(files).sort().forEach((name) => {
    const file = files[name];
    const stream = file.toStream();
    zipFile.addReadStream(stream, name, { mode: file.mode, mtime });
  });

  zipFile.end();
  const zipBuffer = await streamToBuffer(zipFile.outputStream);
  return new Lambda({
    zipBuffer, handler, runtime, environment,
  });
}

module.exports = {
  Lambda,
  createLambda,
};
