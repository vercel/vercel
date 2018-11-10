const assert = require('assert');
const fetch = require('node-fetch');
const MultiStream = require('multistream');
const retry = require('async-retry');
const Sema = require('async-sema');

const semaToDownloadFromS3 = new Sema(10);

class FileRef {
  constructor ({ mode = 0o100644, digest }) {
    assert(typeof mode === 'number');
    assert(typeof digest === 'string');
    this.type = 'FileRef';
    this.mode = mode;
    this.digest = digest;
  }

  async toStreamAsync () {
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
      return await retry(async () => {
        const resp = await fetch(url);
        if (!resp.ok) {
          const error = new Error(`${resp.status} ${resp.statusText}`);
          if (resp.status === 403) error.bail = true;
          throw error;
        }
        return resp.body;
      }, { factor: 1, retries: 3 });
    } finally {
      console.timeEnd(`downloading ${url}`);
      semaToDownloadFromS3.release();
    }
  }

  toStream () {
    let flag;

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

module.exports = FileRef;
