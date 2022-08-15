import { bold } from 'chalk';
import inquirer from 'inquirer';
import { EventEmitter } from 'events';
import { URLSearchParams } from 'url';
import { parse as parseUrl } from 'url';
import { VercelConfig } from '@vercel/client';
import retry, { RetryFunction, Options as RetryOptions } from 'async-retry';
import fetch, { BodyInit, Headers, RequestInit, Response } from 'node-fetch';
import ua from './ua';
import { Output } from './output/create-output';
import responseError from './response-error';
import printIndications from './print-indications';
import reauthenticate from './login/reauthenticate';
import { SAMLError } from './login/types';
import { writeToAuthConfigFile } from './config/files';
import type {
  AuthConfig,
  GlobalConfig,
  JSONObject,
  Stdio,
  ReadableTTY,
  WritableTTY,
} from '../types';
import { sharedPromise } from './promise';
import { APIError } from './errors-ts';

const isSAMLError = (v: any): v is SAMLError => {
  return v && v.saml;
};

export interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | JSONObject;
  json?: boolean;
  retry?: RetryOptions;
  useCurrentTeam?: boolean;
  accountId?: string;
}

export interface ClientOptions extends Stdio {
  argv: string[];
  apiUrl: string;
  authConfig: AuthConfig;
  output: Output;
  config: GlobalConfig;
  localConfig?: VercelConfig;
}

export const isJSONObject = (v: any): v is JSONObject => {
  return v && typeof v == 'object' && v.constructor === Object;
};

export default class Client extends EventEmitter implements Stdio {
  argv: string[];
  apiUrl: string;
  authConfig: AuthConfig;
  stdin: ReadableTTY;
  stdout: WritableTTY;
  stderr: WritableTTY;
  output: Output;
  config: GlobalConfig;
  localConfig?: VercelConfig;
  prompt!: inquirer.PromptModule;
  private requestIdCounter: number;

  constructor(opts: ClientOptions) {
    super();
    this.argv = opts.argv;
    this.apiUrl = opts.apiUrl;
    this.authConfig = opts.authConfig;
    this.stdin = opts.stdin;
    this.stdout = opts.stdout;
    this.stderr = opts.stderr;
    this.output = opts.output;
    this.config = opts.config;
    this.localConfig = opts.localConfig;
    this.requestIdCounter = 1;
    this._createPromptModule();
  }

  retry<T>(fn: RetryFunction<T>, { retries = 3, maxTimeout = Infinity } = {}) {
    return retry(fn, {
      retries,
      maxTimeout,
      onRetry: this._onRetry,
    });
  }

  private _fetch(_url: string, opts: FetchOptions = {}) {
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
    }

    const headers = new Headers(opts.headers);
    headers.set('user-agent', ua);
    if (this.authConfig.token) {
      headers.set('authorization', `Bearer ${this.authConfig.token}`);
    }

    let body;
    if (isJSONObject(opts.body)) {
      body = JSON.stringify(opts.body);
      headers.set('content-type', 'application/json; charset=utf-8');
    } else {
      body = opts.body;
    }

    const url = `${apiUrl ? '' : this.apiUrl}${_url}`;
    const requestId = this.requestIdCounter++;
    return this.output.time(res => {
      if (res) {
        return `#${requestId} ← ${res.status} ${
          res.statusText
        }: ${res.headers.get('x-vercel-id')}`;
      } else {
        return `#${requestId} → ${opts.method || 'GET'} ${url}`;
      }
    }, fetch(url, { ...opts, headers, body }));
  }

  fetch(url: string, opts: { json: false }): Promise<Response>;
  fetch<T>(url: string, opts?: FetchOptions): Promise<T>;
  fetch(url: string, opts: FetchOptions = {}) {
    return this.retry(async bail => {
      const res = await this._fetch(url, opts);

      printIndications(this, res);

      if (!res.ok) {
        const error = await responseError(res);

        if (isSAMLError(error)) {
          try {
            // A SAML error means the token is expired, or is not
            // designated for the requested team, so the user needs
            // to re-authenticate
            await this.reauthenticate(error);
          } catch (reauthError) {
            // there's no sense in retrying
            return bail(reauthError as Error);
          }
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

      const contentType = res.headers.get('content-type');
      if (!contentType) {
        return null;
      }

      return contentType.includes('application/json') ? res.json() : res;
    }, opts.retry);
  }

  reauthenticate = sharedPromise(async function (
    this: Client,
    error: SAMLError
  ) {
    const result = await reauthenticate(this, error);

    if (typeof result === 'number') {
      if (error instanceof APIError) {
        this.output.prettyError(error);
      } else {
        this.output.error(
          `Failed to re-authenticate for ${bold(error.scope)} scope`
        );
      }
      throw error;
    }

    this.authConfig.token = result.token;
    writeToAuthConfigFile(this.authConfig);
  });

  _onRetry = (error: Error) => {
    this.output.debug(`Retrying: ${error}\n${error.stack}`);
  };

  _createPromptModule() {
    this.prompt = inquirer.createPromptModule({
      input: this.stdin as NodeJS.ReadStream,
      output: this.stderr as NodeJS.WriteStream,
    });
  }
}
