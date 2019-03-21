import assert from 'assert';
import fetch from 'node-fetch';
import multiStream from 'multistream';
import retry from 'async-retry';
import Sema from 'async-sema';
import { File } from './types';

interface FileRefOptions {
  mode?: number;
  digest: string;
}

const semaToDownloadFromS3 = new Sema(10);

class BailableError extends Error {
  public bail: boolean;

  constructor(...args: string[]) {
    super(...args);
    this.bail = false;
  }
}

export default class FileRef implements File {
  public type: string;
  public mode: number;
  public digest: string;

  constructor({ mode = 0o100644, digest }: FileRefOptions) {
    assert(typeof mode === 'number');
    assert(typeof digest === 'string');
    this.type = 'FileRef';
    this.mode = mode;
    this.digest = digest;
  }

  async toStreamAsync(): Promise<NodeJS.ReadableStream> {
    let url = '';
    // sha:24be087eef9fac01d61b30a725c1a10d7b45a256
    const digestParts = this.digest.split(':');
    if (digestParts[0] === 'sha') {
      // url = `https://s3.amazonaws.com/now-files/${digestParts[1]}`;
      url = `https://dmmcy0pwk6bqi.cloudfront.net/${digestParts[1]}`;
    } else {
      throw new Error('Expected digest to be sha');
    }

    await semaToDownloadFromS3.acquire();
    // console.time(`downloading ${url}`);
    try {
      return await retry(
        async () => {
          const resp = await fetch(url);
          if (!resp.ok) {
            const error = new BailableError(
              `download: ${resp.status} ${resp.statusText} for ${url}`,
            );
            if (resp.status === 403) error.bail = true;
            throw error;
          }
          return resp.body;
        },
        { factor: 1, retries: 3 },
      );
    } finally {
      // console.timeEnd(`downloading ${url}`);
      semaToDownloadFromS3.release();
    }
  }

  toStream(): NodeJS.ReadableStream {
    let flag = false;

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
