import { homedir } from 'os';
import { resolve as resolvePath, join, basename } from 'path';
import EventEmitter from 'events';
import qs from 'querystring';
import { parse as parseUrl } from 'url';
import bytes from 'bytes';
import chalk from 'chalk';
import retry from 'async-retry';
import { parse as parseIni } from 'ini';
import { createReadStream, promises } from 'fs';
import ms from 'ms';
import {
  staticFiles as getFiles,
  npm as getNpmFiles,
  docker as getDockerFiles
} from './get-files';
import Agent from './agent.ts';
import ua from './ua.ts';
import hash from './hash';
import cmd from './output/cmd.ts';
import highlight from './output/highlight';
import createOutput from './output';
import { responseError } from './error';

// How many concurrent HTTP/2 stream uploads
const MAX_CONCURRENT = 50;

// Check if running windows
const IS_WIN = process.platform.startsWith('win');
const SEP = IS_WIN ? '\\' : '/';

export default class Now extends EventEmitter {
  constructor({ apiUrl, token, currentTeam, forceNew = false, debug = false }) {
    super();

    this._token = token;
    this._debug = debug;
    this._forceNew = forceNew;
    this._output = createOutput({ debug });
    this._apiUrl = apiUrl;
    this._agent = new Agent(apiUrl, { debug });
    this._onRetry = this._onRetry.bind(this);
    this.currentTeam = currentTeam;
    const closeAgent = () => {
      this._agent.close();
      process.removeListener('nowExit', closeAgent);
    };
    process.on('nowExit', closeAgent);
  }

  async create(
    paths,
    {
      // Legacy
      forwardNpm = false,
      scale = {},
      description,
      type = 'npm',
      pkg = {},
      nowConfig = {},
      hasNowJson = false,
      sessionAffinity = 'random',
      isFile = false,
      atlas = false,

      // Latest
      name,
      project,
      wantsPublic,
      meta,
      regions,
      quiet = false,
      env,
      build,
      followSymlinks = true,
      forceNew = false,
      target = null
    }
  ) {
    const { log, warn, time } = this._output;
    const isBuilds = type === null;

    let files = [];
    const relatives = {};
    let engines;

    await time('Getting files', async () => {
      const opts = { output: this._output, hasNowJson };

      if (type === 'npm') {
        files = await getNpmFiles(paths[0], pkg, nowConfig, opts);

        // A `start` or `now-start` npm script, or a `server.js` file
        // in the root directory of the deployment are required
        if (
          !isBuilds &&
          !hasNpmStart(pkg) &&
          !hasFile(paths[0], files, 'server.js')
        ) {
          const err = new Error(
            'Missing `start` (or `now-start`) script in `package.json`. ' +
              'See: https://docs.npmjs.com/cli/start'
          );
          throw err;
        }

        engines = nowConfig.engines || pkg.engines;
        forwardNpm = forwardNpm || nowConfig.forwardNpm;
      } else if (type === 'static') {
        if (isFile) {
          files = [resolvePath(paths[0])];
        } else if (paths.length === 1) {
          files = await getFiles(paths[0], nowConfig, opts);
        } else {
          if (!files) {
            files = [];
          }

          for (const path of paths) {
            const list = await getFiles(path, {}, opts);
            files = files.concat(list);

            for (const file of list) {
              relatives[file] = path;
            }
          }
        }
      } else if (type === 'docker') {
        files = await getDockerFiles(paths[0], nowConfig, opts);
      } else if (isBuilds) {
        opts.isBuilds = isBuilds;

        if (isFile) {
          files = [resolvePath(paths[0])];
        } else if (paths.length === 1) {
          files = await getFiles(paths[0], {}, opts);
        } else {
          if (!files) {
            files = [];
          }

          for (const path of paths) {
            const list = await getFiles(path, {}, opts);
            files = files.concat(list);

            for (const file of list) {
              relatives[file] = path;
            }
          }
        }
      }
    });

    // Read `registry.npmjs.org` authToken from .npmrc
    let authToken;

    if (type === 'npm' && forwardNpm) {
      authToken =
        (await readAuthToken(paths[0])) || (await readAuthToken(homedir()));
    }

    const hashes = await time('Computing hashes', () => {
      const pkgDetails = Object.assign({ name }, pkg);
      return hash(files, pkgDetails);
    });

    this._files = hashes;

    const deployment = await this.retry(async bail => {
      // Flatten the array to contain files to sync where each nested input
      // array has a group of files with the same sha but different path
      const files = await time(
        'Get files ready for deployment',
        Promise.all(
          Array.prototype.concat.apply(
            [],
            await Promise.all(
              Array.from(this._files).map(async ([sha, { data, names }]) => {
                const statFn = followSymlinks ? promises.stat : promises.lstat;

                return names.map(async name => {
                  const getMode = async () => {
                    const st = await statFn(name);
                    return st.mode;
                  };

                  const mode = await getMode();
                  const multipleStatic = Object.keys(relatives).length !== 0;

                  let file;

                  if (isFile) {
                    file = basename(paths[0]);
                  } else if (multipleStatic) {
                    file = toRelative(name, join(relatives[name], '..'));
                  } else {
                    file = toRelative(name, paths[0]);
                  }

                  return {
                    sha,
                    size: data.length,
                    file,
                    mode
                  };
                });
              })
            )
          )
        )
      );

      // This is a useful warning because it prevents people
      // from getting confused about a deployment that renders 404.
      if (files.length === 0 || files.every(item => item.file.startsWith('.'))) {
        warn('There are no files (or only files starting with a dot) inside your deployment.');
      }

      const queryProps = {};
      const requestBody = isBuilds
        ? {
            version: 2,
            env,
            build,
            public: wantsPublic || nowConfig.public,
            name,
            project,
            files,
            meta,
            regions
          }
        : {
            env,
            build,
            meta,
            public: wantsPublic || nowConfig.public,
            forceNew,
            name,
            project,
            description,
            deploymentType: type,
            registryAuthToken: authToken,
            files,
            engines,
            scale,
            sessionAffinity,
            limits: nowConfig.limits,
            atlas
          };

      if (Object.keys(nowConfig).length > 0) {
        if (isBuilds) {
          // These properties are only used inside Now CLI and
          // are not supported on the API.
          const exclude = [
            'github',
            'scope'
          ];

          // Request properties that are made of a combination of
          // command flags and config properties were already set
          // earlier. Here, we are setting request properties that
          // are purely made of their equally-named config property.
          for (const key of Object.keys(nowConfig)) {
            const value = nowConfig[key];

            if (!requestBody[key] && !exclude.includes(key)) {
              requestBody[key] = value;
            }
          }
        } else {
          requestBody.config = nowConfig;
        }
      }

      if (isBuilds) {
        if (forceNew) {
          queryProps.forceNew = 1;
        }

        if (target) {
          requestBody.target = target;
        }

        if (isFile) {
          requestBody.routes = [
            {
              src: '/',
              dest: `/${files[0].file}`
            }
          ];
        }
      }

      const query = qs.stringify(queryProps);
      const version = isBuilds ? 'v9' : 'v4';

      const res = await this._fetch(
        `/${version}/now/deployments${query ? `?${query}` : ''}`,
        {
          method: 'POST',
          body: requestBody
        }
      );

      // No retry on 4xx
      let body;

      try {
        body = await res.json();
      } catch (err) {
        throw new Error('Unexpected response');
      }

      if (res.status === 429) {
        if (body.error && body.error.code === 'builds_rate_limited') {
          const err = new Error(body.error.message);
          err.status = res.status;
          err.retryAfter = 'never';
          err.code = body.error.code;

          return bail(err);
        }

        let msg = 'You have been creating deployments at a very fast pace. ';

        if (body.error && body.error.limit && body.error.limit.reset) {
          const { reset } = body.error.limit;
          const difference = reset * 1000 - Date.now();

          msg += `Please retry in ${ms(difference, { long: true })}.`;
        } else {
          msg += 'Please slow down.';
        }

        const err = new Error(msg);

        err.status = res.status;
        err.retryAfter = 'never';

        return bail(err);
      }

      // If the deployment domain is missing a cert, bail with the error
      if (
        res.status === 400 &&
        body.error &&
        body.error.code === 'cert_missing'
      ) {
        bail(await responseError(res, null, body));
      }

      if (
        res.status === 400 &&
        body.error &&
        body.error.code === 'missing_files'
      ) {
        return body;
      }

      if (
        res.status === 404 &&
        body.error &&
        body.error.code === 'not_found'
      ) {
        return body;
      }

      if (res.status >= 400 && res.status < 500) {
        const err = new Error();

        if (body.error) {
          const { code, unreferencedBuildSpecs } = body.error;

          if (code === 'env_value_invalid_type') {
            const { key } = body.error;
            err.message =
              `The env key ${key} has an invalid type: ${typeof env[key]}. ` +
              'Please supply a String or a Number (https://err.sh/now-cli/env-value-invalid-type)';
          } else if (code === 'unreferenced_build_specifications') {
            const count = unreferencedBuildSpecs.length;
            const prefix = count === 1 ? 'build' : 'builds';

            err.message =
              `You defined ${count} ${prefix} that did not match any source files (please ensure they are NOT defined in ${highlight(
                '.nowignore'
              )}):` +
              `\n- ${unreferencedBuildSpecs
                .map(item => JSON.stringify(item))
                .join('\n- ')}`;
          } else {
            Object.assign(err, body.error);
          }
        } else {
          err.message = 'Not able to create deployment';
        }

        return bail(err);
      }

      if (res.status !== 200) {
        throw new Error(body.error.message);
      }

      return body;
    });

    // We report about files whose sizes are too big
    let missingVersion = false;

    if (deployment.warnings) {
      let sizeExceeded = 0;

      deployment.warnings.forEach(warning => {
        if (warning.reason === 'size_limit_exceeded') {
          const { sha, limit } = warning;
          const n = hashes.get(sha).names.pop();

          warn(`Skipping file ${n} (size exceeded ${bytes(limit)}`);

          hashes.get(sha).names.unshift(n); // Move name (hack, if duplicate matches we report them in order)
          sizeExceeded++;
        } else if (warning.reason === 'node_version_not_found') {
          warn(`Requested node version ${warning.wanted} is not available`);
          missingVersion = true;
        }
      });

      if (sizeExceeded > 0) {
        warn(`${sizeExceeded} of the files exceeded the limit for your plan.`);
        log(`Please run ${cmd('now upgrade')} to upgrade.`);
      }
    }

    if (deployment.error && deployment.error.code === 'missing_files') {
      this._missing = deployment.error.missing || [];
      this._fileCount = files.length;

      return null;
    }

    if (!isBuilds && !quiet && type === 'npm' && deployment.nodeVersion) {
      if (engines && engines.node && !missingVersion) {
        log(
          chalk`Using Node.js {bold ${deployment.nodeVersion}} (requested: {dim \`${engines.node}\`})`
        );
      } else {
        log(chalk`Using Node.js {bold ${deployment.nodeVersion}} (default)`);
      }
    }

    this._id = deployment.deploymentId;
    this._host = deployment.url;
    this._missing = [];
    this._fileCount = files.length;

    return deployment;
  }

  upload({ atlas = false, scale = {} } = {}) {
    const { debug, time } = this._output;
    debug(`Will upload ${this._missing.length} files`);

    this._agent.setConcurrency({
      maxStreams: MAX_CONCURRENT,
      capacity: this._missing.length
    });

    time(
      'Uploading files',
      Promise.all(
        this._missing.map(sha =>
          retry(
            async bail => {
              const file = this._files.get(sha);
              const fPath = file.names[0];
              const stream = createReadStream(fPath);
              const { data } = file;

              const fstreamPush = stream.push;

              let uploadedSoFar = 0;
              stream.push = chunk => {
                // If we're about to push the last chunk, then don't do it here
                // But instead, we'll "hang" the progress bar and do it on 200
                if (chunk && uploadedSoFar + chunk.length < data.length) {
                  this.emit('uploadProgress', chunk.length);
                  uploadedSoFar += chunk.length;
                }
                return fstreamPush.call(stream, chunk);
              };

              const url = atlas ? '/v1/now/images' : '/v2/now/files';
              const additionalHeaders = atlas
                ? {
                    'x-now-dcs': Object.keys(scale).join(',')
                  }
                : {};
              const res = await this._fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/octet-stream',
                  'x-now-digest': sha,
                  'x-now-size': data.length,
                  ...additionalHeaders
                },
                body: stream
              });

              if (res.status === 200) {
                // What we want
                this.emit('uploadProgress', file.data.length - uploadedSoFar);
                this.emit('upload', file);
              } else if (res.status > 200 && res.status < 500) {
                // If something is wrong with our request, we don't retry
                return bail(await responseError(res, 'Failed to upload file'));
              } else {
                // If something is wrong with the server, we retry
                throw await responseError(res, 'Failed to upload file');
              }
            },
            {
              retries: 3,
              randomize: true,
              onRetry: this._onRetry
            }
          )
        )
      )
    )
      .then(() => {
        this.emit('complete');
      })
      .catch(err => this.emit('error', err));
  }

  async listSecrets() {
    const { secrets } = await this.retry(async bail => {
      const res = await this._fetch('/now/secrets');

      if (res.status === 200) {
        // What we want
        return res.json();
      }
      if (res.status > 200 && res.status < 500) {
        // If something is wrong with our request, we don't retry
        return bail(await responseError(res, 'Failed to list secrets'));
      }
      // If something is wrong with the server, we retry
      throw await responseError(res, 'Failed to list secrets');
    });

    return secrets;
  }

  async list(app, { version = 2, meta = {} } = {}) {
    const metaQs = Object.keys(meta)
      .map(key => `meta-${key}=${encodeURIComponent(meta[key])}`)
      .join('&');
    const query = app
      ? `?app=${encodeURIComponent(app)}&${metaQs}`
      : `?${metaQs}`;

    const { deployments } = await this.retry(
      async bail => {
        const res = await this._fetch(`/v${version}/now/deployments${query}`);

        if (res.status === 200) {
          // What we want
          return res.json();
        }
        if (res.status > 200 && res.status < 500) {
          // If something is wrong with our request, we don't retry
          return bail(await responseError(res, 'Failed to list deployments'));
        }
        // If something is wrong with the server, we retry
        throw await responseError(res, 'Failed to list deployments');
      },
      {
        retries: 3,
        minTimeout: 2500,
        onRetry: this._onRetry
      }
    );

    return deployments;
  }

  async listInstances(deploymentId) {
    const { instances } = await this.retry(
      async bail => {
        const res = await this._fetch(
          `/now/deployments/${deploymentId}/instances`
        );

        if (res.status === 200) {
          // What we want
          return res.json();
        }
        if (res.status > 200 && res.status < 500) {
          // If something is wrong with our request, we don't retry
          return bail(await responseError(res, 'Failed to list instances'));
        }
        // If something is wrong with the server, we retry
        throw await responseError(res, 'Failed to list instances');
      },
      {
        retries: 3,
        minTimeout: 2500,
        onRetry: this._onRetry
      }
    );

    return instances;
  }

  async findDeployment(hostOrId) {
    const { debug } = this._output;

    let id = hostOrId && !hostOrId.includes('.');
    let isBuilds = null;

    if (!id) {
      let host = hostOrId.replace(/^https:\/\//i, '');

      if (host.slice(-1) === '/') {
        host = host.slice(0, -1);
      }

      const url = `/v3/now/hosts/${encodeURIComponent(
        host
      )}?resolve=1&noState=1`;

      const { deployment } = await this.retry(
        async bail => {
          const res = await this._fetch(url);

          // No retry on 4xx
          if (res.status >= 400 && res.status < 500) {
            debug(`Bailing on getting a deployment due to ${res.status}`);
            return bail(
              await responseError(res, `Failed to resolve deployment "${id}"`)
            );
          }

          if (res.status !== 200) {
            throw new Error('Fetching a deployment failed');
          }

          return res.json();
        },
        { retries: 3, minTimeout: 2500, onRetry: this._onRetry }
      );

      id = deployment.id;
      isBuilds = deployment.type === 'LAMBDAS';
    }

    const url = `/${isBuilds ? 'v9' : 'v5'}/now/deployments/${encodeURIComponent(id)}`;

    return this.retry(
      async bail => {
        const res = await this._fetch(url);

        // No retry on 4xx
        if (res.status >= 400 && res.status < 500) {
          debug(`Bailing on getting a deployment due to ${res.status}`);
          return bail(
            await responseError(res, `Failed to resolve deployment "${id}"`)
          );
        }

        if (res.status !== 200) {
          throw new Error('Fetching a deployment failed');
        }

        return res.json();
      },
      { retries: 3, minTimeout: 2500, onRetry: this._onRetry }
    );
  }

  async remove(deploymentId, { hard }) {
    const url = `/now/deployments/${deploymentId}?hard=${hard ? 1 : 0}`;

    await this.retry(async bail => {
      const res = await this._fetch(url, {
        method: 'DELETE'
      });

      if (res.status === 200) {
        // What we want
      } else if (res.status > 200 && res.status < 500) {
        // If something is wrong with our request, we don't retry
        return bail(await responseError(res, 'Failed to remove deployment'));
      } else {
        // If something is wrong with the server, we retry
        throw await responseError(res, 'Failed to remove deployment');
      }
    });

    return true;
  }

  retry(fn, { retries = 3, maxTimeout = Infinity } = {}) {
    return retry(fn, {
      retries,
      maxTimeout,
      onRetry: this._onRetry
    });
  }

  _onRetry(err) {
    this._output.debug(`Retrying: ${err}\n${err.stack}`);
  }

  close() {
    this._agent.close();
  }

  get id() {
    return this._id;
  }

  get url() {
    return `https://${this._host}`;
  }

  get fileCount() {
    return this._fileCount;
  }

  get host() {
    return this._host;
  }

  get syncAmount() {
    if (!this._syncAmount) {
      this._syncAmount = this._missing
        .map(sha => this._files.get(sha).data.length)
        .reduce((a, b) => a + b, 0);
    }

    return this._syncAmount;
  }

  get syncFileCount() {
    return this._missing.length;
  }

  _fetch(_url, opts = {}) {
    if (opts.useCurrentTeam !== false && this.currentTeam) {
      const parsedUrl = parseUrl(_url, true);
      const query = parsedUrl.query;

      query.teamId = this.currentTeam;
      _url = `${parsedUrl.pathname}?${qs.encode(query)}`;
      delete opts.useCurrentTeam;
    }

    opts.headers = opts.headers || {};
    opts.headers.authorization = `Bearer ${this._token}`;
    opts.headers['user-agent'] = ua;

    return this._output.time(
      `${opts.method || 'GET'} ${this._apiUrl}${_url} ${JSON.stringify(
        opts.body
      ) || ''}`,
      this._agent.fetch(_url, opts)
    );
  }

  // public retry with built-in retrying that can be
  // used from external utilities. it optioanlly
  // receives a `retry` object in the opts that is
  // passed to the retry utility
  // it accepts a `json` option, which defaults to `true`
  // which automatically returns the json response body
  // if the response is ok and content-type json
  // it does the same for JSON` body` in opts
  async fetch(url, opts = {}) {
    return this.retry(async bail => {
      if (opts.json !== false && opts.body && typeof opts.body === 'object') {
        opts = Object.assign({}, opts, {
          body: JSON.stringify(opts.body),
          headers: Object.assign({}, opts.headers, {
            'Content-Type': 'application/json'
          })
        });
      }
      const res = await this._fetch(url, opts);
      if (res.ok) {
        if (opts.json === false) {
          return res;
        }

        if (!res.headers.get('content-type')) {
          return null;
        }

        return res.headers.get('content-type').includes('application/json')
          ? res.json()
          : res;
      }
      const err = await responseError(res);
      if (res.status >= 400 && res.status < 500) {
        return bail(err);
      }
      throw err;
    }, opts.retry);
  }

  async getPlanMax() {
    return 10;
  }
}

function toRelative(path, base) {
  const fullBase = base.endsWith(SEP) ? base : base + SEP;
  let relative = path.substr(fullBase.length);

  if (relative.startsWith(SEP)) {
    relative = relative.substr(1);
  }

  return relative.replace(/\\/g, '/');
}

function hasNpmStart(pkg) {
  return pkg.scripts && (pkg.scripts.start || pkg.scripts['now-start']);
}

function hasFile(base, files, name) {
  const relative = files.map(file => toRelative(file, base));
  return relative.indexOf(name) !== -1;
}

async function readAuthToken(path, name = '.npmrc') {
  try {
    const contents = await promises.readFile(resolvePath(path, name), 'utf8');
    const npmrc = parseIni(contents);
    return npmrc['//registry.npmjs.org/:_authToken'];
  } catch (err) {
    // Do nothing
  }
}
