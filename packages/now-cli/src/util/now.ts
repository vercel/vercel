import ms from 'ms';
import ua from './ua';
import fetch from 'node-fetch';
import { URLSearchParams } from 'url';
import { responseError } from './error';
import { Dictionary } from '../types';
import { parse as parseUrl } from 'url';
import { Org } from '../types';
import EventEmitter from 'events';
import stamp from './output/stamp';
import { BuildError } from './errors';
import highlight from './output/highlight';
import createOutput, { Output } from './output';
import retry, { RetryFunction } from 'async-retry';
import { NowConfig, DeploymentOptions } from 'now-client';
import processDeployment from './deploy/process-deployment';

interface Options {
  token: string;
  apiUrl: string;
  debug?: boolean;
  forceNew?: boolean;
  currentTeam?: string;
}

interface CreateOptions {
  nowConfig: NowConfig;
  name: string;
  wantsPublic: boolean;
  meta: Dictionary<string>;
  regions: NowConfig['regions'];
  quiet: boolean;
  env: NowConfig['env'];
  build?: NowConfig['build'];
  forceNew: boolean;
  target: string | null;
  withCache: boolean;
  deployStamp: () => string;
  projectSettings: NowConfig['projectSettings'];
  skipAutoDetectionConfirmation: boolean;
}

export default class Now extends EventEmitter {
  public _token: string;
  public _debug: boolean;
  public _forceNew: boolean;
  public _output: Output;
  public _apiUrl: string;
  public currentTeam?: string;
  public url?: string;

  constructor({
    apiUrl,
    token,
    currentTeam,
    forceNew = false,
    withCache = false,
    debug = false,
  }: Options) {
    super();

    this._token = token;
    this._withCache = withCache;
    this._apiUrl = apiUrl;
    this._debug = Boolean(debug);
    this._forceNew = Boolean(forceNew);
    this._output = createOutput({ debug });
    this.currentTeam = currentTeam;

    this._onRetry = this._onRetry.bind(this);
  }

  async create(
    paths: string[],
    {
      nowConfig = {},
      name,
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
    cwd: string
  ) {
    const uploadStamp = stamp();

    const requestBody: DeploymentOptions = {
      ...nowConfig,
      env,
      build,
      public: wantsPublic || nowConfig.public,
      name,
      meta,
      regions,
      target: target || undefined,
      projectSettings,
    };

    const deployment = await processDeployment({
      isLegacy,
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
    });

    return deployment;
  }

  async handleDeploymentError(
    error: any,
    { env }: { env: Dictionary<string> }
  ) {
    if (error.status === 429) {
      if (error.code === 'builds_rate_limited') {
        const err = new Error(error.message) as any;
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

      const err = new Error(msg) as any;

      err.status = error.status;
      err.retryAfter = 'never';

      return err;
    }

    // If the deployment domain is missing a cert, bail with the error
    if (error.status === 400 && error.code === 'cert_missing') {
      return responseError(error, null, error);
    }

    if (error.status === 400 && error.code === 'missing_files') {
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
          'Please supply a String or a Number (https://err.sh/now-cli/env-value-invalid-type)';
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
        meta: {
          entrypoint: error.entrypoint as string,
        },
      });
    }

    if (error.errorCode && error.errorCode === 'BUILD_FAILED') {
      return new BuildError({
        message: error.errorMessage,
        meta: {},
      });
    }

    return new Error(error.message);
  }

  async list(
    app: string,
    {
      version = 4,
      meta = {},
      nextTimestamp,
    }: {
      version?: number;
      meta?: Dictionary<string>;
      nextTimestamp?: number;
    } = {}
  ) {
    const fetchRetry = async (url: string, options = {}) => {
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
        projects.map(async ({ id: projectId }: { id: string }) => {
          const query = new URLSearchParams({
            limit: (1).toString(),
            projectId,
          });
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

    let id: string | null =
      hostOrId && !hostOrId.includes('.') ? hostOrId : null;

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
        { retries: 3, minTimeout: 2500 }
      );

      id = deployment.id;
    }

    return this.retry(
      async bail => {
        const res = await this._fetch(
          `/v12/now/deployments/${encodeURIComponent(id as string)}`
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
      { retries: 3, minTimeout: 2500 }
    );
  }

  async remove(deploymentId: string, { hard }: { hard: boolean }) {
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
    fn: RetryFunction<T>,
    {
      minTimeout,
      retries = 3,
      maxTimeout = Infinity,
    }: {
      retries?: number;
      maxTimeout?: number;
      minTimeout?: number;
    } = {}
  ) {
    return retry(fn, {
      retries,
      maxTimeout,
      minTimeout,
      onRetry: this._onRetry,
    });
  }

  _onRetry(err: Error) {
    this._output.debug(`Retrying: ${err}\n${err.stack}`);
  }

  close() {}

  _fetch(_url: string, opts: any = {}) {
    if (opts.useCurrentTeam !== false && this.currentTeam) {
      const parsedUrl = parseUrl(_url, true);
      const query = new URLSearchParams(parsedUrl.query);
      if (this.currentTeam) {
        query.set('teamId', this.currentTeam);
      }

      _url = `${parsedUrl.pathname}?${query}`;
      delete opts.useCurrentTeam;
    }

    opts.headers = opts.headers || {};
    opts.headers.accept = 'application/json';
    opts.headers.Authorization = `Bearer ${this._token}`;
    opts.headers['user-agent'] = ua;

    if (
      opts.body &&
      typeof opts.body === 'object' &&
      opts.body.constructor === Object
    ) {
      opts.body = JSON.stringify(opts.body);
      opts.headers['Content-Type'] = 'application/json';
    }

    return this._output.time(
      `${opts.method || 'GET'} ${this._apiUrl}${_url} ${opts.body || ''}`,
      fetch(`${this._apiUrl}${_url}`, opts)
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
  async fetch(url: string, opts: any = {}) {
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
}
