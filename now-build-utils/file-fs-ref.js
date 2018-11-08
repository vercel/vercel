const assert = require('assert');
const fs = require('fs-extra');
const lazyReadStream = require('graceful-fs-stream').createReadStream;
const path = require('path');

class FileFsRef {
  constructor ({ mode = 0o100644, fsPath }) {
    assert(typeof mode === 'number');
    assert(typeof fsPath === 'string');
    this.type = 'FileFsRef';
    this.mode = mode;
    this.fsPath = fsPath;
  }

  static async fromStream ({ mode = 0o100644, stream, fsPath }) {
    assert(typeof mode === 'number');
    assert(typeof stream.pipe === 'function'); // is-stream
    assert(typeof fsPath === 'string');
    await fs.mkdirp(path.dirname(fsPath));

    await new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(fsPath);
      stream.pipe(dest);
      stream.on('error', (error) => reject(error));
      dest.on('finish', () => resolve());
      dest.on('error', (error) => reject(error));
    });

    await fs.chmod(fsPath, mode.toString(8).slice(-3));
    return new FileFsRef({ mode, fsPath });
  }

  toStream () {
    // this is done to make yazl work properly. `addFile` is useless as it calls `fs.stat` on
    // all files at once, and no way to avoid it. so i sticked with `addReadStream`, but it has
    // a flaw as well - it requires all streams to be passed, thus `createReadStream` to be
    // called against all files at once. however, a workaround is possible. if we defer a call
    // to `createReadStream` and make it happen in first read call, it makes all streams, passed
    // to addReadStream "dry" (without file handle) and make the file handle be created in `read`
    // calls one-after-one as the library does correctly
    return lazyReadStream(this.fsPath);
  }
}

module.exports = FileFsRef;
