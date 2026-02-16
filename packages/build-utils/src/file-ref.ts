import assert from 'assert';
import multiStream from 'multistream';
import retry from 'async-retry';
import Sema from 'async-sema';
import { FileBase } from './types';
import { toNodeReadable } from './web-stream';

interface FileRefOptions {
  mode?: number;
  digest: string;
  contentType?: string;
  mutable?: boolean;
}

const semaToDownloadFromS3 = new Sema(5);

class BailableError extends Error {
  public bail: boolean;

  constructor(...args: string[]) {
    super(...args);
    this.bail = false;
  }
}

export default class FileRef implements FileBase {
  public type: 'FileRef';
  public mode: number;
  public digest: string;
  public contentType: string | undefined;
  private mutable: boolean;

  constructor({
    mode = 0o100644,
    digest,
    contentType,
    mutable = false,
  }: FileRefOptions) {
    assert(typeof mode === 'number');
    assert(typeof digest === 'string');
    this.type = 'FileRef';
    this.mode = mode;
    this.digest = digest;
    this.contentType = contentType;
    this.mutable = mutable;
  }

  /**
   * Retrieves the URL of the CloudFront distribution for the S3
   * bucket represented by {@link getNowFilesS3Url}.
   *
   * @returns The URL of the CloudFront distribution
   */
  private getNowFilesCloudfrontUrl(): string {
    return (
      getEnvAsUrlOrThrow('NOW_FILES_CLOUDFRONT_URL') ||
      'https://dmmcy0pwk6bqi.cloudfront.net'
    );
  }

  /**
   * Retrieves the URL of the S3 bucket for storing ephemeral files.
   *
   * @returns The URL of the S3 bucket
   */
  private getNowEphemeralFilesS3Url(): string {
    return (
      getEnvAsUrlOrThrow('NOW_EPHEMERAL_FILES_S3_URL') ||
      'https://now-ephemeral-files.s3.amazonaws.com'
    );
  }

  /**
   * Retrieves the URL of the S3 bucket for storing files.
   *
   * @returns The URL of the S3 bucket
   */
  private getNowFilesS3Url(): string {
    return (
      getEnvAsUrlOrThrow('NOW_FILES_S3_URL') ||
      'https://now-files.s3.amazonaws.com'
    );
  }

  async toStreamAsync(): Promise<NodeJS.ReadableStream> {
    let url = '';
    // sha:24be087eef9fac01d61b30a725c1a10d7b45a256
    const [digestType, digestHash] = this.digest.split(':');
    if (digestType === 'sha') {
      // This CloudFront URL edge caches the `now-files` S3 bucket to prevent
      // overloading it. Mutable files cannot be cached.
      url = this.mutable
        ? `${this.getNowFilesS3Url()}/${digestHash}`
        : `${this.getNowFilesCloudfrontUrl()}/${digestHash}`;
    } else if (digestType === 'sha+ephemeral') {
      // This URL is currently only used for cache files that constantly
      // change. We shouldn't cache it on CloudFront because it'd always be a
      // MISS.
      url = `${this.getNowEphemeralFilesS3Url()}/${digestHash}`;
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
              `download: ${resp.status} ${resp.statusText} for ${url}`
            );
            if (resp.status === 403) error.bail = true;
            throw error;
          }
          return toNodeReadable(resp.body!);
        },
        { factor: 1, retries: 3 }
      );
    } finally {
      // console.timeEnd(`downloading ${url}`);
      semaToDownloadFromS3.release();
    }
  }

  toStream(): NodeJS.ReadableStream {
    let flag = false;

    // eslint-disable-next-line consistent-return
    return multiStream(cb => {
      if (flag) return cb(null, null);
      flag = true;

      this.toStreamAsync()
        .then(stream => {
          cb(null, stream);
        })
        .catch(error => {
          cb(error, null);
        });
    });
  }
}

/**
 * Get the value of the environment variable `key` as a valid URL string or `undefined` if unset.
 *
 * @param key The `process.env` member which holds the value to validate
 * @returns The valid URL string or `undefined` if `key` is not set on `process.env`
 */
function getEnvAsUrlOrThrow(
  key: keyof (typeof process)['env']
): ReturnType<URL['toString']> | undefined {
  const value = process.env[key];

  if (value === undefined) return undefined;

  try {
    new URL(value);
    return value;
  } catch (e) {
    if (e instanceof TypeError && 'code' in e && e.code === 'ERR_INVALID_URL') {
      throw new Error(
        `A non-URL value was supplied to the ${key} environment variable`
      );
    } else {
      throw e;
    }
  }
}
