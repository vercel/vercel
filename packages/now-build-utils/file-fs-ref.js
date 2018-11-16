const assert = require('assert');
const fs = require('fs-extra');
const MultiStream = require('multistream');
const path = require('path');
const Sema = require('async-sema');

const semaToPreventEMFILE = new Sema(30);

class FileFsRef {
  constructor({ mode = 0o100644, fsPath }) {
    assert(typeof mode === 'number');
    assert(typeof fsPath === 'string');
    this.type = 'FileFsRef';
    this.mode = mode;
    this.fsPath = fsPath;
  }

  static async fromStream({ mode = 0o100644, stream, fsPath }) {
    assert(typeof mode === 'number');
    assert(typeof stream.pipe === 'function'); // is-stream
    assert(typeof fsPath === 'string');
    await fs.mkdirp(path.dirname(fsPath));

    await new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(fsPath);
      stream.pipe(dest);
      stream.on('error', reject);
      dest.on('finish', resolve);
      dest.on('error', reject);
    });

    await fs.chmod(fsPath, mode.toString(8).slice(-3));
    return new FileFsRef({ mode, fsPath });
  }

  async toStreamAsync() {
    await semaToPreventEMFILE.acquire();
    const release = () => semaToPreventEMFILE.release();
    const stream = fs.createReadStream(this.fsPath);
    stream.on('close', release);
    stream.on('error', release);
    return stream;
  }

  toStream() {
    let flag;

    // eslint-disable-next-line consistent-return
    return new MultiStream((cb) => {
      if (flag) return cb();
      flag = true;

      this.toStreamAsync().then((stream) => {
        cb(undefined, stream);
      }).catch((error) => {
        cb(error);
      });
    });
  }
}

module.exports = FileFsRef;
