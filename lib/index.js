import bytes from 'bytes';
import chalk from 'chalk';
import getFiles from './get-files';
import hash from './hash';
import retry from './retry';
import Agent from './agent';
import EventEmitter from 'events';
import { basename, resolve } from 'path';
import { stat, readFile } from 'fs-promise';
import resumer from 'resumer';
import splitArray from 'split-array';

// how many concurrent HTTP/2 stream uploads
const MAX_CONCURRENT = 10;

// check if running windows
const IS_WIN = /^win/.test(process.platform);
const SEP = IS_WIN ? '\\' : '/';

export default class Now extends EventEmitter {
  constructor (url, token, { forceNew = false, debug = false }) {
    super();
    this._token = token;
    this._debug = debug;
    this._forceNew = forceNew;
    this._agent = new Agent(url, { debug });
    this._onRetry = this._onRetry.bind(this);
  }

  async create (path, { forceNew, forceSync }) {
    this._path = path;

    try {
      await stat(path);
    } catch (err) {
      const e = new Error(`Could not read directory ${path}.`);
      e.userError = true;
      throw e;
    }
    let pkg;
    try {
      pkg = await readFile(resolve(path, 'package.json'));
      pkg = JSON.parse(pkg);
    } catch (err) {
      const e = Error(`Failed to read JSON in "${path}/package.json"`);
      e.userError = true;
      throw e;
    }

    if (null == pkg.name || 'string' !== typeof pkg.name) {
      const e = Error('Missing or invalid `name` in `package.json`.');
      e.userError = true;
      throw e;
    }

    if (!pkg.scripts || (!pkg.scripts.start && !pkg.scripts['now-start'])) {
      const e = Error('Missing `start` (or `now-start`) script in `package.json`. ' +
        'See: https://docs.npmjs.com/cli/start.');
      e.userError = true;
      throw e;
    }

    if (this._debug) console.time('> [debug] Getting files');
    const files = await getFiles(path, pkg, { debug: this._debug });
    if (this._debug) console.timeEnd('> [debug] Getting files');

    if (this._debug) console.time('> [debug] Computing hashes');
    const hashes = await hash(files);
    if (this._debug) console.timeEnd('> [debug] Computing hashes');

    this._files = hashes;

    const deployment = await retry(async (bail) => {
      if (this._debug) console.time('> [debug] /now/create');
      const res = await this._fetch('/now/create', {
        method: 'POST',
        body: {
          forceNew,
          forceSync,
          name: pkg.name || basename(path),
          description: pkg.description,
          // Flatten the array to contain files to sync where each nested input
          // array has a group of files with the same sha but different path
          files: Array.prototype.concat.apply([], Array.from(this._files).map(([sha, { data, names }]) => {
            return names.map((name) => {
              return {
                sha,
                size: data.length,
                file: toRelative(name, this._path)
              };
            });
          }))
        }
      });
      if (this._debug) console.timeEnd('> [debug] /now/create');

      // no retry on 4xx
      if (200 !== res.status && (400 <= res.status && 500 > res.status)) {
        if (this._debug) {
          console.log('> [debug] bailing on creating due to %s', res.status);
        }
        return bail(responseError(res));
      }

      if (200 !== res.status) {
        throw new Error('Deployment initialization failed');
      }

      return res.json();
    }, { retries: 3, minTimeout: 2500, onRetry: this._onRetry });

    // we report about files whose sizes are too big
    if (deployment.warnings) {
      let sizeExceeded = 0;
      deployment.warnings.forEach(({ reason, sha, limit }) => {
        if ('size_exceeded' === reason) {
          console.error('> \u001b[31mWarning!\u001b[39m Skipping file %s (size exceeded %s)',
            hashes.get(sha),
            bytes(limit)
          );
          sizeExceeded++;
        }
      });

      if (sizeExceeded) {
        console.log('> \u001b[31mWarning!\u001b[39m %d of the files ' +
          'exceeded the limit for your plan.\n' +
          `> See ${chalk.underline('https://zeit.co/account')} to upgrade.`);
      }
    }

    this._id = deployment.deploymentId;
    this._host = deployment.url;
    this._missing = deployment.missing || [];

    return this._url;
  }

  upload () {
    const parts = splitArray(this._missing, MAX_CONCURRENT);

    if (this._debug) {
      console.log('> [debug] Will upload ' +
        `${this._missing.length} files in ${parts.length} ` +
        `steps of ${MAX_CONCURRENT} uploads.`);
    }

    const uploadChunk = () => {
      Promise.all(parts.shift().map((sha) => retry(async (bail) => {
        const file = this._files.get(sha);
        const { data, names } = file;

        if (this._debug) console.time(`> [debug] /sync ${names.join(' ')}`);

        const stream = resumer().queue(data).end();
        const res = await this._fetch('/now/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': data.length,
            'x-now-deployment-id': this._id,
            'x-now-sha': sha,
            'x-now-file': names.map((name) => toRelative(name, this._path)).join(','),
            'x-now-size': data.length
          },
          body: stream
        });
        if (this._debug) console.timeEnd(`> [debug] /sync ${names.join(' ')}`);

        // no retry on 4xx
        if (200 !== res.status && (400 <= res.status || 500 > res.status)) {
          if (this._debug) console.log('> [debug] bailing on creating due to %s', res.status);
          return bail(responseError(res));
        }

        this.emit('upload', file);
      }, { retries: 5, randomize: true, onRetry: this._onRetry })))
      .then(() => parts.length ? uploadChunk() : this.emit('complete'))
      .catch((err) => this.emit('error', err));
    };

    uploadChunk();
  }

  async list (app) {
    const query = app ? `?app=${encodeURIComponent(app)}` : '';

    const { deployments } = await retry(async (bail) => {
      if (this._debug) console.time('> [debug] /list');
      const res = await this._fetch('/now/list' + query);
      if (this._debug) console.timeEnd('> [debug] /list');

      // no retry on 4xx
      if (400 <= res.status && 500 > res.status) {
        if (this._debug) {
          console.log('> [debug] bailing on listing due to %s', res.status);
        }
        return bail(responseError(res));
      }

      if (200 !== res.status) {
        throw new Error('Fetching deployment list failed');
      }

      return res.json();
    }, { retries: 3, minTimeout: 2500, onRetry: this._onRetry });

    return deployments;
  }

  async remove (deploymentId, { hard }) {
    const data = { deploymentId, hard };

    await retry(async (bail) => {
      if (this._debug) console.time('> [debug] /remove');
      const res = await this._fetch('/now/remove', {
        method: 'DELETE',
        body: data
      });
      if (this._debug) console.timeEnd('> [debug] /remove');

      // no retry on 4xx
      if (400 <= res.status && 500 > res.status) {
        if (this._debug) {
          console.log('> [debug] bailing on removal due to %s', res.status);
        }
        return bail(responseError(res));
      }

      if (200 !== res.status) {
        throw new Error('Removing deployment failed');
      }
    }, { retries: 3, minTimeout: 2500, onRetry: this._onRetry });

    return true;
  }

  _onRetry (err) {
    if (this._debug) {
      console.log(`> [debug] Retrying: ${err.stack}`);
    }
  }

  close () {
    this._agent.close();
  }

  get id () {
    return this._id;
  }

  get url () {
    return `https://${this._host}`;
  }

  get host () {
    return this._host;
  }

  get syncAmount () {
    if (!this._syncAmount) {
      this._syncAmount = this._missing
      .map((sha) => this._files.get(sha).data.length)
      .reduce((a, b) => a + b, 0);
    }
    return this._syncAmount;
  }

  async _fetch (_url, opts = {}) {
    opts.headers = opts.headers || {};
    opts.headers.authorization = `Bearer ${this._token}`;
    return await this._agent.fetch(_url, opts);
  }
}

function toRelative (path, base) {
  const fullBase = base.endsWith(SEP) ? base : base + SEP;
  let relative = path.substr(fullBase.length);
  if (relative.startsWith(SEP)) relative = relative.substr(1);
  return relative.replace(/\\/g, '/');
}

function responseError (res) {
  const err = new Error('Response error');
  err.status = res.status;

  if (429 === res.status) {
    const retryAfter = res.headers.get('Retry-After');
    if (retryAfter) {
      err.retryAfter = parseInt(retryAfter, 10);
    }
  }

  return err;
}
