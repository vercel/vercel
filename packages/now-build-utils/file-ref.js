const assert = require('assert');
const fetch = require('node-fetch');
const multiStream = require('multistream');
const retry = require('async-retry');
const Sema = require('async-sema');

/** @typedef {{[filePath: string]: FileRef}} Files */

const semaToDownloadFromS3 = new Sema(10);

class BailableError extends Error {
  constructor(...args) {
    super(...args);
    /** @type {boolean} */
    this.bail = false;
  }
}

/**
 * @constructor
 * @argument {Object} options
 * @argument {number} [options.mode=0o100644]
 * @argument {string} options.digest
 */
class FileRef {
  constructor({ mode = 0o100644, digest }) {
    assert(typeof mode === 'number');
    assert(typeof digest === 'string');
    /** @type {string} */
    this.type = 'FileRef';
    /** @type {number} */
    this.mode = mode;
    /** @type {string} */
    this.digest = digest;
  }

  /**
   * @returns {Promise<NodeJS.ReadableStream>}
   */
  async toStreamAsync() {
    let url;
    // sha:24be087eef9fac01d61b30a725c1a10d7b45a256
    const digestParts = this.digest.split(':');
    if (digestParts[0] === 'sha') {
      // url = `https://s3.amazonaws.com/now-files/${digestParts[1]}`;
      url = `https://dmmcy0pwk6bqi.cloudfront.net/${digestParts[1]}`;
    }

    assert(url);

    await semaToDownloadFromS3.acquire();
    console.time(`downloading ${url}`);
    try {
      return await retry(
        async () => {
          const resp = await fetch(url);
          if (!resp.ok) {
            const error = new BailableError(
              `${resp.status} ${resp.statusText}`,
            );
            if (resp.status === 403) error.bail = true;
            throw error;
          }
          return resp.body;
        },
        { factor: 1, retries: 3 },
      );
    } finally {
      console.timeEnd(`downloading ${url}`);
      semaToDownloadFromS3.release();
    }
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

module.exports = FileRef;
