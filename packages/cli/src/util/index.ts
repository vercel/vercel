import qs from 'querystring';
import { parse as parseUrl } from 'url';
import retry from 'async-retry';
import ms from 'ms';
import bytes from 'bytes';
import chalk from 'chalk';
import ua from './ua';
import processDeployment from './deploy/process-deployment';
import { responseError } from './error';
import stamp from './output/stamp';
import { APIError, BuildError } from './errors-ts';
import printIndications from './print-indications';
import type { GitMetadata, Org } from '@vercel-internals/types';
import type { VercelConfig } from './dev/types';
import type Client from './client';
import { type FetchOptions, isJSONObject } from './client';
import type { ArchiveFormat, Dictionary } from '@vercel/client';
import output from '../output-manager';
import sleep from './sleep';

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

  // Latest
  name: string;
  project?: string;
  wantsPublic: boolean;
  prebuilt?: boolean;
  vercelOutputDir?: string;
  rootDirectory?: string | null;
  meta: Dictionary<string>;
  gitMetadata?: GitMetadata;
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
  noWait?: boolean;
  withFullLogs?: boolean;
  autoAssignCustomDomains?: boolean;
  agentName?: string;
  manual?: boolean;
}

export interface RemoveOptions {
  hard?: boolean;
}

export interface ListOptions {
  version?: number;
  meta?: Dictionary<string>;
  nextTimestamp?: number;
  target?: string;
  policy?: Dictionary<string>;
}

export default class Now {
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

  async create(
    path: string,
    {
      // Legacy
      nowConfig: nowConfig = {},

      // Latest
      name,
      project,
      prebuilt = false,
      vercelOutputDir,
      rootDirectory,
      wantsPublic,
      meta,
      gitMetadata,
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
      noWait,
      withFullLogs,
      autoAssignCustomDomains,
      agentName,
      manual,
    }: CreateOptions,
    org: Org,
    isSettingUpProject: boolean,
    archive?: ArchiveFormat
  ) {
    const hashes: any = {};
    const uploadStamp = stamp();

    const requestBody = {
      ...nowConfig,
      env,
      build,
      public: wantsPublic || nowConfig.public,
      name,
      project,
      meta,
      gitMetadata,
      regions,
      target: target || undefined,
      projectSettings,
      source: 'cli',
      actor: agentName,
      autoAssignCustomDomains,
    };

    // Ignore specific items from vercel.json
    delete requestBody.scope;
    delete requestBody.github;

    const deployment = await processDeployment({
      now: this,
      agent: this._client.agent,
      path,
      requestBody,
      uploadStamp,
      deployStamp,
      quiet,
      force: forceNew,
      withCache,
      org,
      projectName: name,
      isSettingUpProject,
      archive,
      skipAutoDetectionConfirmation,
      prebuilt,
      vercelOutputDir,
      rootDirectory,
      noWait,
      withFullLogs,
      bulkRedirectsPath: nowConfig.bulkRedirectsPath,
      manual,
    });

    if (deployment && deployment.warnings) {
      let sizeExceeded = 0;
      const { log, warn } = output;

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
        const err: APIError = Object.create(APIError.prototype);
        err.message = error.message;
        err.status = error.status;
        err.retryAfterMs = 'never';
        err.code = error.code;
        return err;
      }

      let msg = 'You have been creating deployments at a very fast pace. ';

      if (error.limit && error.limit.reset) {
        const { reset } = error.limit;
        const difference = reset - Date.now();

        msg += `Please retry in ${ms(difference, { long: true })}.`;
      } else {
        msg += 'Please slow down.';
      }

      const err: APIError = Object.create(APIError.prototype);
      err.message = msg;
      err.status = error.status;
      err.retryAfterMs = 'never';

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

      const { code } = error;

      if (code === 'env_value_invalid_type') {
        const { key } = error;
        err.message =
          `The env key ${key} has an invalid type: ${typeof env[key]}. ` +
          'Please supply a String or a Number (https://err.sh/vercel/env-value-invalid-type)';
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
      error.errorCode === 'UNEXPECTED_ERROR' ||
      error.errorCode?.includes('BUILD_UTILS_SPAWN_')
    ) {
      return new BuildError({
        message: error.errorMessage,
        meta: {},
      });
    }

    return new Error(error.message || error.errorMessage);
  }

  async remove(deploymentId: string, { hard = false }: RemoveOptions) {
    const url = `/now/deployments/${deploymentId}?hard=${hard ? 1 : 0}`;

    await this.retry(async bail => {
      const res = await this._fetch(url, {
        method: 'DELETE',
      });

      if (res.status === 200) {
        // What we want
      } else {
        const error = await responseError(res, 'Failed to remove deployment');
        // Always respect Retry-After headers and retry
        if (typeof error.retryAfterMs === 'number') {
          // The `Retry-After` header from the api tells us when the next rate
          // limit token is available. There may only be a single rate limit
          // token available at that time. Add a random skew to prevent creating
          // a thundering herd.
          const randomSkewMs = 30_000 * Math.random();
          await sleep(error.retryAfterMs + randomSkewMs);
          throw error;
        }
        if (res.status > 200 && res.status < 500) {
          // If something is wrong with our request, we don't retry
          return bail(error);
        } else {
          // If something is wrong with the server, we retry
          throw error;
        }
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
    output.debug(`Retrying: ${err}\n${err.stack}`);
  }

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

    const res = await output.time(
      `${opts.method || 'GET'} ${this._apiUrl}${_url} ${opts.body || ''}`,
      fetch(`${this._apiUrl}${_url}`, { ...opts, body })
    );
    printIndications(res);
    return res;
  }

  // public fetch with built-in retrying that can be
  // used from external utilities. it optionally
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
      // Always respect Retry-After headers and retry
      if (typeof err.retryAfterMs === 'number') {
        // The `Retry-After` header from the api tells us when the next rate
        // limit token is available. There may only be a single rate limit
        // token available at that time. Add a random skew to prevent creating
        // a thundering herd.
        const randomSkewMs = 30_000 * Math.random();
        await sleep(err.retryAfterMs + randomSkewMs);
        throw err;
      }
      if (res.status >= 400 && res.status < 500) {
        return bail(err);
      }
      throw err;
    }, opts.retry);
  }
}
