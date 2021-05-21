import { URLSearchParams } from 'url';
import { EventEmitter } from 'events';
import { parse as parseUrl } from 'url';
import fetch, { RequestInit, Response } from 'node-fetch';
import retry, { RetryFunction, Options as RetryOptions } from 'async-retry';
import { Output } from './output/create-output';
import responseError from './response-error';
import ua from './ua';
import printIndications from './print-indications';
import { AuthConfig, GlobalConfig } from '../types';
import { VercelConfig } from './dev/types';
import doSsoLogin from './login/sso';
import { writeToAuthConfigFile } from './config/files';

export interface FetchOptions {
  body?: NodeJS.ReadableStream | object | string;
  headers?: { [key: string]: string };
  json?: boolean;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  retry?: RetryOptions;
  useCurrentTeam?: boolean;
  accountId?: string;
}

export interface ClientOptions {
  argv: string[];
  apiUrl: string;
  authConfig: AuthConfig;
  output: Output;
  config: GlobalConfig;
  localConfig: VercelConfig;
}

export default class Client extends EventEmitter {
  argv: string[];
  apiUrl: string;
  authConfig: AuthConfig;
  output: Output;
  config: GlobalConfig;
  localConfig: VercelConfig;

  constructor(opts: ClientOptions) {
    super();
    this.argv = opts.argv;
    this.apiUrl = opts.apiUrl;
    this.authConfig = opts.authConfig;
    this.output = opts.output;
    this.config = opts.config;
    this.localConfig = opts.localConfig;
    this._onRetry = this._onRetry.bind(this);
  }

  retry<T>(fn: RetryFunction<T>, { retries = 3, maxTimeout = Infinity } = {}) {
    return retry(fn, {
      retries,
      maxTimeout,
      onRetry: this._onRetry,
    });
  }

  _fetch(_url: string, opts: FetchOptions = {}) {
    const parsedUrl = parseUrl(_url, true);
    const apiUrl = parsedUrl.host
      ? `${parsedUrl.protocol}//${parsedUrl.host}`
      : '';

    if (opts.accountId || opts.useCurrentTeam !== false) {
      const query = new URLSearchParams(parsedUrl.query);

      if (opts.accountId) {
        if (opts.accountId.startsWith('team_')) {
          query.set('teamId', opts.accountId);
        } else {
          query.delete('teamId');
        }
      } else if (opts.useCurrentTeam !== false && this.config.currentTeam) {
        query.set('teamId', this.config.currentTeam);
      }

      _url = `${apiUrl}${parsedUrl.pathname}?${query}`;

      delete opts.useCurrentTeam;
      delete opts.accountId;
    }

    if (opts.json !== false && opts.body && typeof opts.body === 'object') {
      Object.assign(opts, {
        body: JSON.stringify(opts.body),
        headers: Object.assign({}, opts.headers, {
          'Content-Type': 'application/json',
        }),
      });
    }

    opts.headers = opts.headers || {};
    opts.headers.Authorization = `Bearer ${this.authConfig.token}`;
    opts.headers['user-agent'] = ua;

    const url = `${apiUrl ? '' : this.apiUrl}${_url}`;
    return this.output.time(
      `${opts.method || 'GET'} ${url} ${JSON.stringify(opts.body) || ''}`,
      fetch(url, opts as RequestInit)
    );
  }

  fetch(url: string, opts: { json: false }): Promise<Response>;
  fetch<T>(url: string, opts?: FetchOptions): Promise<T>;
  async fetch<T>(url: string, opts: FetchOptions = {}): Promise<T> {
    return this.retry(async bail => {
      const res = await this._fetch(url, opts);

      printIndications(res);

      if (!res.ok) {
        const error = await responseError(res);

        if (error.saml && error.teamId) {
          // If a SAML error is encountered then we re-trigger the SAML
          // authentication flow for the team specified in the error.
          const result = await doSsoLogin(error.teamId, this);

          if (typeof result === 'number') {
            this.output.prettyError(error);
            process.exit(1);
            return;
          }

          this.authConfig.token = result;
          writeToAuthConfigFile(this.authConfig);
        } else if (res.status >= 400 && res.status < 500) {
          // Any other 4xx should bail without retrying
          return bail(error);
        }

        // Retry
        throw error;
      }

      if (opts.json === false) {
        return res;
      }

      if (!res.headers.get('content-type')) {
        return null;
      }

      return res.headers.get('content-type').includes('application/json')
        ? res.json()
        : res;
    }, opts.retry);
  }

  _onRetry(error: Error) {
    this.output.debug(`Retrying: ${error}\n${error.stack}`);
  }

  close() {}
}
