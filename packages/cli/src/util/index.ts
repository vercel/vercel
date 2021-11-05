import EventEmitter from 'events';
import qs from 'querystring';
import { parse as parseUrl } from 'url';
import retry from 'async-retry';
import ms from 'ms';
import fetch, { Headers } from 'node-fetch';
import { URLSearchParams } from 'url';
import bytes from 'bytes';
import chalk from 'chalk';
import ua from './ua';
import processDeployment from './deploy/process-deployment';
import highlight from './output/highlight';
import { responseError } from './error';
import stamp from './output/stamp';
import { APIError, BuildError } from './errors-ts';
import printIndications from './print-indications';
import { Org } from '../types';
import { VercelConfig } from './dev/types';
import Client, { FetchOptions, isJSONObject } from './client';
import { Dictionary } from '@vercel/client';

export interface NowOptions {
  client: Client;
  url?: string | null;
  currentTeam?: string | null;
  forceNew?: boolean;
  withCache?: boolean;
}

export interface CreateOptions {
  // Legacy
  nowConfig?: VercelConfig;
  isFile?: boolean;

  // Latest
  name: string;
  project?: string;
  wantsPublic: boolean;
  prebuilt?: boolean;
  meta: Dictionary<string>;
  regions?: string[];
  quiet?: boolean;
  env: Dictionary<string>;
  build: { env: Dictionary<string> };
  forceNew?: boolean;
  withCache?: boolean;
  target?: string | null;
  deployStamp: () => string;
  projectSettings?: any;
  skipAutoDetectionConfirmation?: boolean;
}

export interface RemoveOptions {
  hard?: boolean;
}

export interface ListOptions {
  version?: number;
  meta?: Dictionary<string>;
  nextTimestamp?: number;
}

export default class Now extends EventEmitter {
  url: string | null;
  currentTeam: string | null;
  _client: Client;
  _forceNew: boolean;
  _withCache: boolean;
  _syncAmount?: number;
  _files?: any[];
  _missing?: string[];

  constructor({
    client,
    url = null,
    currentTeam = null,
    forceNew = false,
    withCache = false,
  }: NowOptions) {
    super();

    this.url = url;
    this._client = client;
    this._forceNew = forceNew;
    this._withCache = withCache;
    this._onRetry = this._onRetry.bind(this);
    this.currentTeam = currentTeam;
  }

  get _apiUrl() {
    return this._client.apiUrl;
  }

  get _token() {
    return this._client.authConfig.token;
  }

  get _output() {
    return this._client.output;
  }

  get _debug() {
    return this._client.output.isDebugEnabled();
  }

  async create(
    paths: string[],
    {
      // Legacy
      nowConfig: nowConfig = {},

      // Latest
      name,
      project,
      prebuilt = false,
      wantsPublic,
      meta,
      regions,
      quiet = false,
      env,
      build,
      forceNew = false,
      withCache = false,
      target = null,
      deployStamp,
      projectSettings,
      skipAutoDetectionConfirmation,
    }: CreateOptions,
    org: Org,
    isSettingUpProject: boolean,
    cwd?: string
  ) {
    let hashes: any = {};
    const uploadStamp = stamp();

    let requestBody = {
      ...nowConfig,
      env,
      build,
      public: wantsPublic || nowConfig.public,
      name,
      project,
      meta,
      regions,
      target: target || undefined,
      projectSettings,
      source: 'cli',
    };

    // Ignore specific items from vercel.json
    delete requestBody.scope;
    delete requestBody.github;

    const deployment = await processDeployment({
      now: this,
      output: this._output,
      paths,
      requestBody,
      uploadStamp,
      deployStamp,
      quiet,
      nowConfig,
      force: forceNew,
      withCache,
      org,
      projectName: name,
      isSettingUpProject,
      skipAutoDetectionConfirmation,
      cwd,
      prebuilt,
    });

    if (deployment && deployment.warnings) {
      let sizeExceeded = 0;
      const { log, warn } = this._output;

      deployment.warnings.forEach((warning: any) => {
        if (warning.reason === 'size_limit_exceeded') {
          const { sha, limit } = warning;
          const n = hashes[sha].names.pop();

          warn(`Skipping file ${n} (size exceeded ${bytes(limit)}`);

          hashes[sha].names.unshift(n); // Move name (hack, if duplicate matches we report them in order)
          sizeExceeded++;
        } else if (warning.reason === 'node_version_not_found') {
          warn(`Requested node version ${warning.wanted} is not available`);
        }
      });
      if (sizeExceeded > 0) {
        warn(`${sizeExceeded} of the files exceeded the limit for your plan.`);
        log(
          `Please upgrade your plan here: ${chalk.cyan(
            'https://vercel.com/account/plan'
          )}`
        );
      }
    }

    return deployment;
  }

  async handleDeploymentError(error: any, { env }: any) {
    if (error.status === 429) {
      if (error.code === 'builds_rate_limited') {
        const err = Object.create(APIError.prototype);
        err.message = error.message;
        err.status = error.status;
        err.retryAfter = 'never';
        err.code = error.code;
        return err;
      }

      let msg = 'You have been creating deployments at a very fast pace. ';

      if (error.limit && error.limit.reset) {
        const { reset } = error.limit;
        const difference = reset * 1000 - Date.now();

        msg += `Please retry in ${ms(difference, { long: true })}.`;
      } else {
        msg += 'Please slow down.';
      }

      const err = Object.create(APIError.prototype);
      err.message = msg;
      err.status = error.status;
      err.retryAfter = 'never';

      return err;
    }

    // If the deployment domain is missing a cert, bail with the error
    if (error.status === 400 && error.code === 'cert_missing') {
      return responseError(error, null, error);
    }

    if (error.status === 400 && error.code === 'missing_files') {
      this._missing = error.missing || [];
      return error;
    }

    if (error.status === 404 && error.code === 'not_found') {
      return error;
    }

    if (error.status >= 400 && error.status < 500) {
      const err = new Error();

      const { code, unreferencedBuildSpecs } = error;

      if (code === 'env_value_invalid_type') {
        const { key } = error;
        err.message =
          `The env key ${key} has an invalid type: ${typeof env[key]}. ` +
          'Please supply a String or a Number (https://err.sh/vercel-cli/env-value-invalid-type)';
      } else if (code === 'unreferenced_build_specifications') {
        const count = unreferencedBuildSpecs.length;
        const prefix = count === 1 ? 'build' : 'builds';

        err.message =
          `You defined ${count} ${prefix} that did not match any source files (please ensure they are NOT defined in ${highlight(
            '.vercelignore'
          )}):` +
          `\n- ${unreferencedBuildSpecs
            .map((item: any) => JSON.stringify(item))
            .join('\n- ')}`;
      } else {
        Object.assign(err, error);
      }

      return err;
    }

    // Handle build errors
    if (error.id && error.id.startsWith('bld_')) {
      return new BuildError({
        message: 'Build failed',
        meta: {
          entrypoint: error.entrypoint,
        },
      });
    }

    if (
      error.errorCode === 'BUILD_FAILED' ||
      error.errorCode === 'UNEXPECTED_ERROR'
    ) {
      return new BuildError({
        message: error.errorMessage,
        meta: {},
      });
    }

    return new Error(error.message);
  }

  async listSecrets(next?: number, testWarningFlag?: boolean) {
    const payload = await this.retry(async bail => {
      let secretsUrl = '/v3/now/secrets?limit=20';

      if (next) {
        secretsUrl += `&until=${next}`;
      }

      if (testWarningFlag) {
        secretsUrl += '&testWarning=1';
      }

      const res = await this._fetch(secretsUrl);

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

    return payload;
  }

  async list(
    app?: string,
    { version = 4, meta = {}, nextTimestamp }: ListOptions = {}
  ) {
    const fetchRetry = async (url: string, options: FetchOptions = {}) => {
      return this.retry(
        async bail => {
          const res = await this._fetch(url, options);

          if (res.status === 200) {
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
          onRetry: this._onRetry,
        }
      );
    };

    if (!app && !Object.keys(meta).length) {
      // Get the 20 latest projects and their latest deployment
      const query = new URLSearchParams({ limit: (20).toString() });
      if (nextTimestamp) {
        query.set('until', String(nextTimestamp));
      }
      const { projects, pagination } = await fetchRetry(
        `/v4/projects/?${query}`
      );

      const deployments = await Promise.all(
        projects.map(async ({ id: projectId }: any) => {
          const query = new URLSearchParams({ limit: '1', projectId });
          const { deployments } = await fetchRetry(
            `/v${version}/now/deployments?${query}`
          );
          return deployments[0];
        })
      );

      return { deployments: deployments.filter(x => x), pagination };
    }

    const query = new URLSearchParams();

    if (app) {
      query.set('app', app);
    }

    Object.keys(meta).map(key => query.set(`meta-${key}`, meta[key]));

    query.set('limit', '20');

    if (nextTimestamp) {
      query.set('until', String(nextTimestamp));
    }

    const response = await fetchRetry(`/v${version}/now/deployments?${query}`);
    return response;
  }

  async findDeployment(hostOrId: string) {
    const { debug } = this._output;

    let id = hostOrId && !hostOrId.includes('.');

    if (!id) {
      let host = hostOrId.replace(/^https:\/\//i, '');

      if (host.slice(-1) === '/') {
        host = host.slice(0, -1);
      }

      const url = `/v10/now/deployments/get?url=${encodeURIComponent(
        host
      )}&resolve=1&noState=1`;

      const deployment = await this.retry(
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
    }

    return this.retry(
      async bail => {
        const res = await this._fetch(
          `/v11/now/deployments/${encodeURIComponent(id)}`
        );

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

  async remove(deploymentId: string, { hard = false }: RemoveOptions) {
    const url = `/now/deployments/${deploymentId}?hard=${hard ? 1 : 0}`;

    await this.retry(async bail => {
      const res = await this._fetch(url, {
        method: 'DELETE',
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

  retry<T>(
    fn: retry.RetryFunction<T>,
    { retries = 3, maxTimeout = Infinity }: retry.Options = {}
  ) {
    return retry<T>(fn, {
      retries,
      maxTimeout,
      onRetry: this._onRetry,
    });
  }

  _onRetry(err: Error) {
    this._output.debug(`Retrying: ${err}\n${err.stack}`);
  }

  close() {}

  async _fetch(_url: string, opts: FetchOptions = {}) {
    if (opts.useCurrentTeam !== false && this.currentTeam) {
      const parsedUrl = parseUrl(_url, true);
      const query = parsedUrl.query;

      query.teamId = this.currentTeam;
      _url = `${parsedUrl.pathname}?${qs.stringify(query)}`;
      delete opts.useCurrentTeam;
    }

    opts.headers = new Headers(opts.headers);
    opts.headers.set('accept', 'application/json');
    if (this._token) {
      opts.headers.set('authorization', `Bearer ${this._token}`);
    }
    opts.headers.set('user-agent', ua);

    let body;
    if (isJSONObject(opts.body)) {
      body = JSON.stringify(opts.body);
      opts.headers.set('content-type', 'application/json; charset=utf8');
    } else {
      body = opts.body;
    }

    const res = await this._output.time(
      `${opts.method || 'GET'} ${this._apiUrl}${_url} ${opts.body || ''}`,
      fetch(`${this._apiUrl}${_url}`, { ...opts, body })
    );
    printIndications(res);
    return res;
  }

  // public fetch with built-in retrying that can be
  // used from external utilities. it optioanlly
  // receives a `retry` object in the opts that is
  // passed to the retry utility
  // it accepts a `json` option, which defaults to `true`
  // which automatically returns the json response body
  // if the response is ok and content-type json
  // it does the same for JSON` body` in opts
  async fetch(url: string, opts: FetchOptions = {}) {
    return this.retry(async bail => {
      if (opts.json !== false && opts.body && typeof opts.body === 'object') {
        opts = Object.assign({}, opts, {
          body: JSON.stringify(opts.body),
          headers: Object.assign({}, opts.headers, {
            'Content-Type': 'application/json',
          }),
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

        return res.headers.get('content-type')?.includes('application/json')
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
}
