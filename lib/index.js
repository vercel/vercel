import bytes from 'bytes';
import chalk from 'chalk';
import {
  npm as getNpmFiles,
  docker as getDockerFiles
} from './get-files';
import ua from './ua';
import hash from './hash';
import retry from 'async-retry';
import Agent from './agent';
import EventEmitter from 'events';
import { basename, resolve as resolvePath } from 'path';
import { homedir } from 'os';
import { parse as parseIni } from 'ini';
import { readFile } from 'fs-promise';
import resumer from 'resumer';
import splitArray from 'split-array';
import { parse as parseDockerfile } from 'docker-file-parser';

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

  async create (path, {
    wantsPublic,
    quiet = false,
    forceNew = false,
    forceSync = false,
    forwardNpm = false,
    deploymentType = 'npm'
  }) {
    this._path = path;

    let pkg = {};
    let name, description, files;

    if ('npm' === deploymentType) {
      try {
        pkg = await readFile(resolvePath(path, 'package.json'));
        pkg = JSON.parse(pkg);
      } catch (err) {
        const e = Error(`Failed to read JSON in "${path}/package.json"`);
        e.userError = true;
        throw e;
      }

      if (!pkg.scripts || (!pkg.scripts.start && !pkg.scripts['now-start'])) {
        const e = Error('Missing `start` (or `now-start`) script in `package.json`. ' +
          'See: https://docs.npmjs.com/cli/start.');
        e.userError = true;
        throw e;
      }

      if (null == pkg.name || 'string' !== typeof pkg.name) {
        name = basename(path);
        if (!quiet) console.log(`> No \`name\` in \`package.json\`, using ${chalk.bold(name)}`);
      } else {
        name = pkg.name;
      }

      description = pkg.description;

      if (this._debug) console.time('> [debug] Getting files');
      files = await getNpmFiles(path, pkg, { debug: this._debug });
      if (this._debug) console.timeEnd('> [debug] Getting files');
    } else if ('docker' === deploymentType) {
      let docker;
      try {
        const dockerfile = await readFile(resolvePath(path, 'Dockerfile'), 'utf8');
        docker = parseDockerfile(dockerfile, { includeComments: true });
      } catch (err) {
        const e = Error(`Failed to parse "${path}/Dockerfile"`);
        e.userError = true;
        throw e;
      }

      if (!docker.length) {
        const e = Error('No commands found in `Dockerfile`');
        e.userError = true;
        throw e;
      }

      if (!docker.some((cmd) => 'CMD' === cmd.name)) {
        const e = Error('No `CMD` found in `Dockerfile`. ' +
          'See: https://docs.docker.com/engine/reference/builder/#/run');
        e.userError = true;
        throw e;
      }

      if (!docker.some((cmd) => 'EXPOSE' === cmd.name)) {
        const e = Error('No `EXPOSE` found in `Dockerfile`. A port must be supplied. ' +
          'See: https://docs.docker.com/engine/reference/builder/#/expose');
        e.userError = true;
        throw e;
      }

      const labels = {};
      docker
      .filter(cmd => 'LABEL' === cmd.name)
      .forEach(({ args }) => {
        for (let key in args) {
          // unescape and convert into string
          try {
            labels[key] = JSON.parse(args[key]);
          } catch (err) {
            const e = Error(`Error parsing value for LABEL ${key} in \`Dockerfile\``);
            e.userError = true;
            throw e;
          }
        }
      });

      if (null == labels.name) {
        name = basename(path);
        if (!quiet) console.log(`> No \`name\` LABEL in \`Dockerfile\`, using ${chalk.bold(name)}`);
      } else {
        name = labels.name;
      }

      description = labels.description;

      if (this._debug) console.time('> [debug] Getting files');
      files = await getDockerFiles(path, { debug: this._debug });
      if (this._debug) console.timeEnd('> [debug] Getting files');
    }

    const nowProperties = pkg ? pkg.now || {} : {};

    forwardNpm = forwardNpm || nowProperties['forwardNpm'];

    // Read .npmrc
    let npmrc = {};
    let authToken;
    if ('npm' === deploymentType && forwardNpm) {
      try {
        npmrc = await readFile(resolvePath(path, '.npmrc'), 'utf8');
        npmrc = parseIni(npmrc);
        authToken = npmrc['//registry.npmjs.org/:_authToken'];
      } catch (err) {
        // Do nothing
      }

      if (!authToken) {
        try {
          npmrc = await readFile(resolvePath(homedir(), '.npmrc'), 'utf8');
          npmrc = parseIni(npmrc);
          authToken = npmrc['//registry.npmjs.org/:_authToken'];
        } catch (err) {
          // Do nothing
        }
      }
    }

    if (this._debug) console.time('> [debug] Computing hashes');
    const hashes = await hash(files);
    if (this._debug) console.timeEnd('> [debug] Computing hashes');

    this._files = hashes;

    const engines = nowProperties.engines || pkg.engines;

    const deployment = await this.retry(async (bail) => {
      if (this._debug) console.time('> [debug] /now/create');
      const res = await this._fetch('/now/create', {
        method: 'POST',
        body: {
          public: wantsPublic,
          forceNew,
          forceSync,
          name: name,
          description,
          deploymentType,
          registryAuthToken: authToken,
          // Flatten the array to contain files to sync where each nested input
          // array has a group of files with the same sha but different path
          files: Array.prototype.concat.apply([], Array.from(this._files).map(([sha, { data, names }]) => {
            return names.map((n) => {
              return {
                sha,
                size: data.length,
                file: toRelative(n, this._path)
              };
            });
          })),
          engines
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
    });

    // we report about files whose sizes are too big
    let missingVersion = false;
    if (deployment.warnings) {
      let sizeExceeded = 0;
      deployment.warnings.forEach((warning) => {
        if ('size_limit_exceeded' === warning.reason) {
          const { sha, limit } = warning;
          const n = hashes.get(sha).names.pop();
          console.error('> \u001b[31mWarning!\u001b[39m Skipping file %s (size exceeded %s)',
            n,
            bytes(limit)
          );
          hashes.get(sha).names.unshift(n); // move name (hack, if duplicate matches we report them in order)
          sizeExceeded++;
        } else if ('node_version_not_found' === warning.reason) {
          const { wanted, used } = warning;
          console.error('> \u001b[31mWarning!\u001b[39m Requested node version %s is not available',
            wanted,
            used
          );
          missingVersion = true;
        }
      });

      if (sizeExceeded) {
        console.error(`> \u001b[31mWarning!\u001b[39m ${sizeExceeded} of the files ` +
          'exceeded the limit for your plan.\n' +
          `> See ${chalk.underline('https://zeit.co/account')} to upgrade.`);
      }
    }

    if (!quiet && deployment.nodeVersion) {
      if (engines && engines.node) {
        if (missingVersion) {
          console.log(`> Using Node.js ${chalk.bold(deployment.nodeVersion)} (default)`);
        } else {
          console.log(`> Using Node.js ${chalk.bold(deployment.nodeVersion)} (requested: ${chalk.dim(`\`${engines.node}\``)})`);
        }
      } else {
        console.log(`> Using Node.js ${chalk.bold(deployment.nodeVersion)} (default)`);
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
      Promise.all(parts.shift().map((sha) => retry(async (bail, attempt) => {
        const file = this._files.get(sha);
        const { data, names } = file;

        if (this._debug) console.time(`> [debug] /sync #${attempt} ${names.join(' ')}`);
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
        if (this._debug) console.timeEnd(`> [debug] /sync #${attempt} ${names.join(' ')}`);

        // no retry on 4xx
        if (200 !== res.status && (400 <= res.status || 500 > res.status)) {
          if (this._debug) console.log('> [debug] bailing on creating due to %s', res.status);
          return bail(responseError(res));
        }

        this.emit('upload', file);
      }, { retries: 3, randomize: true, onRetry: this._onRetry })))
      .then(() => parts.length ? uploadChunk() : this.emit('complete'))
      .catch((err) => this.emit('error', err));
    };

    uploadChunk();
  }

  async list (app) {
    const query = app ? `?app=${encodeURIComponent(app)}` : '';

    const { deployments } = await this.retry(async (bail) => {
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

  async listAliases (deploymentId) {
    return this.retry(async (bail, attempt) => {
      const res = await this._fetch(deploymentId
        ? `/now/deployments/${deploymentId}/aliases`
        : '/now/aliases');
      const body = await res.json();
      return body.aliases;
    });
  }

  getNameservers (domain, { fallback = false } = {}) {
    try {
      return this.retry(async (bail, attempt) => {
        if (this._debug) console.time(`> [debug] #${attempt} GET /whois-ns${fallback ? '-fallback' : ''}`);
        const res = await this._fetch(`/whois-ns${fallback ? '-fallback' : ''}?domain=${encodeURIComponent(domain)}`);
        if (this._debug) console.timeEnd(`> [debug] #${attempt} GET /whois-ns${fallback ? '-fallback' : ''}`);
        const body = await res.json();
        if (200 === res.status) {
          if ((!body.nameservers || body.nameservers.length === 0) && !fallback) {
            // if the nameservers are `null` it's likely
            // that our whois service failed to parse it
            return this.getNameservers(domain, { fallback: true });
          }

          return body;
        } else {
          throw new Error(`Whois error (${res.status}): ${body.error.message}`);
        }
      });
    } catch (err) {
      if (fallback) throw err;
      return this.getNameservers(domain, { fallback: true });
    }
  }

  // _ensures_ the domain is setup (idempotent)
  setupDomain (name) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) console.time(`> [debug] #${attempt} POST /domains`);
      const res = await this._fetch('/domains', {
        method: 'POST',
        body: { name }
      });
      if (this._debug) console.timeEnd(`> [debug] #${attempt} POST /domains`);

      if (403 === res.status) {
        const body = await res.json();
        const code = body.error.code;
        let err;

        if ('custom_domain_needs_upgrade' === code) {
          err = new Error(`Custom domains are only enabled for premium accounts. Please upgrade at ${chalk.underline('https://zeit.co/account')}.`);
        } else {
          err = new Error(`Not authorized to access domain ${name}`);
        }

        err.userError = true;
        return bail(err);
      }

      const body = await res.json();

      // domain already exists
      if (409 === res.status) {
        if (this._debug) console.log('> [debug] Domain already exists (noop)');
        return { uid: body.error.uid };
      }

      if (200 !== res.status) {
        throw new Error(body.error.message);
      }

      return body;
    });
  }

  async remove (deploymentId, { hard }) {
    const data = { deploymentId, hard };

    await this.retry(async (bail) => {
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
    });

    return true;
  }

  retry (fn, { retries = 3, maxTimeout = Infinity } = {}) {
    return retry(fn, {
      retries,
      maxTimeout,
      onRetry: this._onRetry
    });
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

  _fetch (_url, opts = {}) {
    opts.headers = opts.headers || {};
    opts.headers.authorization = `Bearer ${this._token}`;
    opts.headers['user-agent'] = ua;
    return this._agent.fetch(_url, opts);
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
