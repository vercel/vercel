import { URLSearchParams } from 'url';
import { EventEmitter } from 'events';
import { parse as parseUrl } from 'url';
import fetch, { RequestInit } from 'node-fetch';
import retry, { RetryFunction, Options as RetryOptions } from 'async-retry';
import createOutput, { Output } from './output/create-output';
import responseError from './response-error';
import ua from './ua';

export interface FetchOptions {
  body?: NodeJS.ReadableStream | object | string;
  headers?: { [key: string]: string };
  json?: boolean;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  retry?: RetryOptions;
  useCurrentTeam?: boolean;
  accountId?: string;
}

export default class Client extends EventEmitter {
  _apiUrl: string;
  _debug: boolean;
  _forceNew: boolean;
  _withCache: boolean;
  _output: Output;
  _token: string;
  currentTeam?: string | null;

  constructor({
    apiUrl,
    token,
    currentTeam,
    forceNew = false,
    withCache = false,
    debug = false,
    output = createOutput({ debug }),
  }: {
    apiUrl: string;
    token: string;
    currentTeam?: string | null;
    forceNew?: boolean;
    withCache?: boolean;
    debug?: boolean;
    output?: Output;
  }) {
    super();
    this._token = token;
    this._debug = debug;
    this._forceNew = forceNew;
    this._withCache = withCache;
    this._output = output;
    this._apiUrl = apiUrl;
    this._onRetry = this._onRetry.bind(this);
    this.currentTeam = currentTeam;
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
      } else if (opts.useCurrentTeam !== false && this.currentTeam) {
        query.set('teamId', this.currentTeam);
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
    opts.headers.Authorization = `Bearer ${this._token}`;
    opts.headers['user-agent'] = ua;

    const url = `${apiUrl ? '' : this._apiUrl}${_url}`;
    return this._output.time(
      `${opts.method || 'GET'} ${url} ${JSON.stringify(opts.body) || ''}`,
      fetch(url, opts as RequestInit)
    );
  }

  async fetch<T>(url: string, opts: FetchOptions = {}): Promise<T> {
    return this.retry(async bail => {
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
      const error = await responseError(res);
      if (res.status >= 400 && res.status < 500) {
        return bail(error);
      }

      throw error;
    }, opts.retry);
  }

  _onRetry(error: Error) {
    this._output.debug(`Retrying: ${error}\n${error.stack}`);
  }

  close() {}
}
