const assert = require('assert');
const intoStream = require('into-stream');

class FileBlob {
  constructor ({ mode = 0o100644, data }) {
    assert(typeof mode === 'number');
    assert(typeof data === 'string' || Buffer.isBuffer(data));
    this.type = 'FileBlob';
    this.mode = mode;
    this.data = data;
  }

  static async fromStream ({ mode = 0o100644, stream }) {
    assert(typeof mode === 'number');
    assert(typeof stream.pipe === 'function'); // is-stream
    const chunks = [];

    await new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', (error) => reject(error));
      stream.on('end', () => resolve());
    });

    const data = Buffer.concat(chunks);
    return new FileBlob({ mode, data });
  }

  toStream () {
    return intoStream(this.data);
  }
}

module.exports = FileBlob;
