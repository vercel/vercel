const assert = require('assert');
const fs = require('fs-extra');
const multiStream = require('multistream');
const path = require('path');
const Sema = require('async-sema');

/** @typedef {{[filePath: string]: FileFsRef}} FsFiles */

const semaToPreventEMFILE = new Sema(30);

/**
 * @constructor
 * @argument {Object} options
 * @argument {number} [options.mode=0o100644]
 * @argument {string} options.fsPath
 */
class FileFsRef {
  constructor({ mode = 0o100644, fsPath }) {
    assert(typeof mode === 'number');
    assert(typeof fsPath === 'string');
    /** @type {string} */
    this.type = 'FileFsRef';
    /** @type {number} */
    this.mode = mode;
    /** @type {string} */
    this.fsPath = fsPath;
  }

  /**
   * Creates a `FileFsRef` with the correct `mode` from the file system.
   *
   * @argument {Object} options
   * @argument {string} options.fsPath
   * @returns {Promise<FileFsRef>}
   */
  static async fromFsPath({ fsPath }) {
    const { mode } = await fs.lstat(fsPath);
    return new FileFsRef({ mode, fsPath });
  }

  /**
   * @argument {Object} options
   * @argument {number} [options.mode=0o100644]
   * @argument {NodeJS.ReadableStream} options.stream
   * @argument {string} options.fsPath
   * @returns {Promise<FileFsRef>}
   */
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

  /**
   * @returns {Promise<NodeJS.ReadableStream>}
   */
  async toStreamAsync() {
    await semaToPreventEMFILE.acquire();
    const release = () => semaToPreventEMFILE.release();
    const stream = fs.createReadStream(this.fsPath);
    stream.on('close', release);
    stream.on('error', release);
    return stream;
  }

  /**
   * @returns {NodeJS.ReadableStream}
   */
  toStream() {
    let flag;

    // eslint-disable-next-line consistent-return
    return multiStream((cb) => {
      if (flag) return cb(null, null);
      flag = true;

      this.toStreamAsync()
        .then((stream) => {
          cb(null, stream);
        })
        .catch((error) => {
          cb(error, null);
        });
    });
  }
}

module.exports = FileFsRef;
