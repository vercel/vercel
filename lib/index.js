import getFiles from './get-files';
import hash from './hash';
import retry from './retry';
import bytes from 'bytes';
import Agent from './agent';
import EventEmitter from 'events';
import { basename, resolve } from 'path';
import { stat, readFile } from 'fs-promise';
import resumer from 'resumer';
import splitArray from 'split-array';

// limit of size of files to find
const ONEMB = bytes('1mb');

// how many concurrent HTTP/2 stream uploads
const MAX_CONCURRENT = 10;

export default class Now extends EventEmitter {
  constructor (token, { forceNew = false, debug = false }) {
    super();
    this._token = token;
    this._debug = debug;
    this._forceNew = forceNew;
    this._agent = new Agent('api.now.sh', { debug });
    this._onRetry = this._onRetry.bind(this);
  }

  async create (path, { forceNew, forceSync }) {
    this._path = path;

    try {
      await stat(path);
    } catch (err) {
      throw new Error(`Could not read directory ${path}.`);
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
    const files = await getFiles(path, pkg, { limit: ONEMB, debug: this._debug });
    if (this._debug) console.timeEnd('> [debug] Getting files');

    if (this._debug) console.time('> [debug] Computing hashes');
    const hashes = await hash(files);
    if (this._debug) console.timeEnd('> [debug] Computing hashes');

    this._files = hashes;

    const deployment = await retry(async (bail) => {
      if (this._debug) console.time('> [debug] /create');
      const res = await this._fetch('/create', {
        method: 'POST',
        body: {
          forceNew,
          forceSync,
          name: pkg.name || basename(path),
          description: pkg.description,
          files: Array.from(this._files).map(([sha, { data, name }]) => {
            return {
              sha,
              size: data.length,
              file: toRelative(name, this._path)
            };
          })
        }
      });
      if (this._debug) console.timeEnd('> [debug] /create');

      // no retry on 4xx
      if (400 <= res.status && 500 > res.status) {
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

    this._id = deployment.deploymentId;
    this._url = deployment.url;
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
        const { data, name } = file;

        if (this._debug) console.time(`> [debug] /sync ${name}`);

        const stream = resumer().queue(data).end();
        const res = await this._fetch('/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': data.length,
            'x-now-deployment-id': this._id,
            'x-now-sha': sha,
            'x-now-file': toRelative(name, this._path),
            'x-now-size': data.length
          },
          body: stream
        });
        if (this._debug) console.timeEnd(`> [debug] /sync ${name}`);

        // no retry on 4xx
        if (400 <= res.status || 500 > res.status) {
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

  _onRetry (err) {
    if (this._debug) {
      console.log(`> [debug] Retrying: ${err.stack}`);
    }
  }

  close () {
    this._agent.close();
  }

  get url () {
    return this._url;
  }

  get syncAmount () {
    if (!this._syncAmount) {
      this._syncAmount = this._missing
      .map((sha) => this._files.get(sha).data.length)
      .reduce((a, b) => a + b, 0);
    }
    return this._syncAmount;
  }

  async _fetch (url, opts) {
    opts.headers = opts.headers || {};
    opts.headers.authorization = `Bearer ${this._token}`;
    return await this._agent.fetch(url, opts);
  }
}

function toRelative (path, base) {
  const fullBase = /\/$/.test(base) ? base + '/' : base;
  const relative = path.substr(fullBase.length);
  if (relative.startsWith('/')) return relative.substr(1);
  return relative;
}

function responseError (res) {
  const err = new Error('Response error');
  err.status = res.status;
  return err;
}
