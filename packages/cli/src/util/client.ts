import { bold } from 'chalk';
import { checkbox, confirm, expand, input, select } from '@inquirer/prompts';
import { EventEmitter } from 'events';
import { URL } from 'url';
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
  PaginationOptions,
} from '@vercel-internals/types';
import { sharedPromise } from './promise';
import { APIError } from './errors-ts';
import { normalizeError } from '@vercel/error-utils';
import type { Agent } from 'http';
import sleep from './sleep';
import type * as tty from 'tty';

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
  localConfigPath?: string;
  agent?: Agent;
}

export const isJSONObject = (v: any): v is JSONObject => {
  return v && typeof v == 'object' && v.constructor === Object;
};
export function createInput(stdin: ReadableTTY, stderr: tty.WriteStream) {
  return {
    text: (opts: Parameters<typeof input>[0]) =>
      input(opts, { input: stdin, output: stderr }),
    checkbox: <T>(opts: Parameters<typeof checkbox<T>>[0]) =>
      checkbox<T>(opts, { input: stdin, output: stderr }),
    expand: (opts: Parameters<typeof expand>[0]) =>
      expand(opts, { input: stdin, output: stderr }),
    confirm: (opts: Parameters<typeof confirm>[0]) =>
      confirm(opts, { input: stdin, output: stderr }),
    select: <T>(opts: Parameters<typeof select<T>>[0]) =>
      select<T>(opts, { input: stdin, output: stderr }),
  };
}

export default class Client extends EventEmitter implements Stdio {
  argv: string[];
  apiUrl: string;
  authConfig: AuthConfig;
  stdin: ReadableTTY;
  stdout: tty.WriteStream;
  stderr: tty.WriteStream;
  output: Output;
  config: GlobalConfig;
  agent?: Agent;
  localConfig?: VercelConfig;
  localConfigPath?: string;
  requestIdCounter: number;
  input;

  constructor(opts: ClientOptions) {
    super();
    this.agent = opts.agent;
    this.argv = opts.argv;
    this.apiUrl = opts.apiUrl;
    this.authConfig = opts.authConfig;
    this.stdin = opts.stdin;
    this.stdout = opts.stdout;
    this.stderr = opts.stderr;
    this.output = opts.output;
    this.config = opts.config;
    this.localConfig = opts.localConfig;
    this.localConfigPath = opts.localConfigPath;
    this.requestIdCounter = 1;
    // this.input = {
    //   text: (opts: Parameters<typeof input>[0]) =>
    //     input(opts, { input: this.stdin, output: this.stderr }),
    //   checkbox: <T>(opts: Parameters<typeof checkbox<T>>[0]) =>
    //     checkbox<T>(opts, { input: this.stdin, output: this.stderr }),
    //   expand: (opts: Parameters<typeof expand>[0]) =>
    //     expand(opts, { input: this.stdin, output: this.stderr }),
    //   confirm: (opts: Parameters<typeof confirm>[0]) =>
    //     confirm(opts, { input: this.stdin, output: this.stderr }),
    //   select: <T>(opts: Parameters<typeof select<T>>[0]) =>
    //     select<T>(opts, { input: this.stdin, output: this.stderr }),
    // };
    this.input = createInput(this.stdin, this.stderr);
  }

  retry<T>(fn: RetryFunction<T>, { retries = 3, maxTimeout = Infinity } = {}) {
    return retry(fn, {
      retries,
      maxTimeout,
      onRetry: this._onRetry,
    });
  }

  private _fetch(_url: string, opts: FetchOptions = {}) {
    const url = new URL(_url, this.apiUrl);

    if (opts.accountId || opts.useCurrentTeam !== false) {
      if (opts.accountId) {
        if (opts.accountId.startsWith('team_')) {
          url.searchParams.set('teamId', opts.accountId);
        } else {
          url.searchParams.delete('teamId');
        }
      } else if (opts.useCurrentTeam !== false && this.config.currentTeam) {
        url.searchParams.set('teamId', this.config.currentTeam);
      }
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

    const requestId = this.requestIdCounter++;
    return this.output.time(res => {
      if (res) {
        return `#${requestId} ← ${res.status} ${
          res.statusText
        }: ${res.headers.get('x-vercel-id')}`;
      } else {
        return `#${requestId} → ${opts.method || 'GET'} ${url.href}`;
      }
    }, fetch(url, { agent: this.agent, ...opts, headers, body }));
  }

  fetch(url: string, opts: FetchOptions & { json: false }): Promise<Response>;
  fetch<T>(url: string, opts?: FetchOptions): Promise<T>;
  fetch(url: string, opts: FetchOptions = {}) {
    return this.retry(async bail => {
      const res = await this._fetch(url, opts);

      printIndications(this, res);

      if (!res.ok) {
        const error = await responseError(res);

        // we should force reauth only if error has a teamId
        if (isSAMLError(error) && error.teamId) {
          try {
            // A SAML error means the token is expired, or is not
            // designated for the requested team, so the user needs
            // to re-authenticate
            await this.reauthenticate(error);
          } catch (reauthError) {
            // there's no sense in retrying
            return bail(normalizeError(reauthError));
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

  async *fetchPaginated<T>(
    url: string | URL,
    opts?: FetchOptions
  ): AsyncGenerator<T & { pagination: PaginationOptions }> {
    const endpoint =
      typeof url === 'string' ? new URL(url, this.apiUrl) : new URL(url.href);
    if (!endpoint.searchParams.has('limit')) {
      endpoint.searchParams.set('limit', '100');
    }
    let next: number | null | undefined;
    do {
      if (next) {
        // Small sleep to avoid rate limiting
        await sleep(100);
        endpoint.searchParams.set('until', String(next));
      }
      const res = await this.fetch<T & { pagination: PaginationOptions }>(
        endpoint.href,
        opts
      );
      yield res;
      next = res.pagination?.next;
    } while (next);
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

  get cwd(): string {
    return process.cwd();
  }

  set cwd(v: string) {
    process.chdir(v);
  }
}
