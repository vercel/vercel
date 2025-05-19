import { bold, gray } from 'chalk';
import checkbox from '@inquirer/checkbox';
import confirm from '@inquirer/confirm';
import expand from '@inquirer/expand';
import input from '@inquirer/input';
import select from '@inquirer/select';
import { EventEmitter } from 'events';
import { URL } from 'url';
import type { VercelConfig } from '@vercel/client';
import retry, {
  type RetryFunction,
  type Options as RetryOptions,
} from 'async-retry';
import fetch, {
  type BodyInit,
  Headers,
  type RequestInit,
  type Response,
} from 'node-fetch';
import ua from './ua';
import responseError from './response-error';
import printIndications from './print-indications';
import reauthenticate from './login/reauthenticate';
import type { SAMLError } from './login/types';
import { writeToAuthConfigFile, writeToConfigFile } from './config/files';
import type { TelemetryEventStore } from './telemetry';
import type {
  AuthConfig,
  GlobalConfig,
  JSONObject,
  Stdio,
  ReadableTTY,
  PaginationOptions,
  OAuthAuthConfig,
} from '@vercel-internals/types';
import { sharedPromise } from './promise';
import { APIError } from './errors-ts';
import { normalizeError } from '@vercel/error-utils';
import type { Agent } from 'http';
import sleep from './sleep';
import type * as tty from 'tty';
import output from '../output-manager';
import { processTokenResponse, refreshTokenRequest } from './oauth';

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
  config: GlobalConfig;
  localConfig?: VercelConfig;
  localConfigPath?: string;
  agent?: Agent;
  telemetryEventStore: TelemetryEventStore;
}

export const isJSONObject = (v: any): v is JSONObject => {
  return v && typeof v == 'object' && v.constructor === Object;
};

export function isOAuthAuth(
  authConfig: AuthConfig
): authConfig is OAuthAuthConfig {
  return authConfig.type === 'oauth';
}

export function isValidAccessToken(authConfig: OAuthAuthConfig): boolean {
  return 'token' in authConfig && (authConfig.expiresAt ?? 0) >= Date.now();
}

export function hasRefreshToken(
  authConfig: OAuthAuthConfig
): authConfig is OAuthAuthConfig & { refreshToken: string } {
  return 'refreshToken' in authConfig;
}

export default class Client extends EventEmitter implements Stdio {
  argv: string[];
  apiUrl: string;
  authConfig: AuthConfig;
  stdin: ReadableTTY;
  stdout: tty.WriteStream;
  stderr: tty.WriteStream;
  config: GlobalConfig;
  agent?: Agent;
  localConfig?: VercelConfig;
  localConfigPath?: string;
  requestIdCounter: number;
  input;
  telemetryEventStore: TelemetryEventStore;

  constructor(opts: ClientOptions) {
    super();
    this.agent = opts.agent;
    this.argv = opts.argv;
    this.apiUrl = opts.apiUrl;
    this.authConfig = opts.authConfig;
    this.stdin = opts.stdin;
    this.stdout = opts.stdout;
    this.stderr = opts.stderr;
    this.config = opts.config;
    this.localConfig = opts.localConfig;
    this.localConfigPath = opts.localConfigPath;
    this.requestIdCounter = 1;
    this.telemetryEventStore = opts.telemetryEventStore;

    const theme = {
      prefix: gray('?'),
      style: { answer: gray },
    };
    this.input = {
      text: (opts: Parameters<typeof input>[0]) =>
        input({ theme, ...opts }, { input: this.stdin, output: this.stderr }),
      checkbox: <T>(opts: Parameters<typeof checkbox<T>>[0]) =>
        checkbox<T>(
          { theme, ...opts },
          { input: this.stdin, output: this.stderr }
        ),
      expand: (opts: Parameters<typeof expand>[0]) =>
        expand({ theme, ...opts }, { input: this.stdin, output: this.stderr }),
      confirm: (message: string, default_value: boolean) =>
        confirm(
          { theme, message, default: default_value },
          { input: this.stdin, output: this.stderr }
        ),
      select: <T>(opts: Parameters<typeof select<T>>[0]) =>
        select<T>(
          { theme, ...opts },
          { input: this.stdin, output: this.stderr }
        ),
    };
  }

  retry<T>(fn: RetryFunction<T>, { retries = 3, maxTimeout = Infinity } = {}) {
    return retry(fn, {
      retries,
      maxTimeout,
      onRetry: this._onRetry,
    });
  }

  /**
   * When the auth config is of type `OAuthAuthConfig`,
   * this method silently tries to refresh the access_token if it is expired.
   *
   * If the refresh_token is also expired, it will not attempt to refresh it.
   * If there is any error during the refresh process, it will not throw an error.
   */
  private async ensureAuthorized(): Promise<void> {
    if (!isOAuthAuth(this.authConfig)) return;

    const { authConfig } = this;

    // If we have a valid access token, do nothing
    if (isValidAccessToken(authConfig)) {
      output.debug('Valid access token, skipping token refresh.');
      return;
    }

    // If we don't have a refresh token, empty the auth config
    // to force the user to re-authenticate
    if (!hasRefreshToken(authConfig)) {
      output.debug('No refresh token found, emptying auth config.');
      this.emptyAuthConfig();
      this.writeToAuthConfigFile();
      return;
    }

    const tokenResponse = await refreshTokenRequest({
      refresh_token: authConfig.refreshToken,
    });

    const [tokensError, tokens] = await processTokenResponse(tokenResponse);

    // If we had an error, during the refresh process, empty the auth config
    // to force the user to re-authenticate
    if (tokensError) {
      output.debug('Error refreshing token, emptying auth config.');
      this.emptyAuthConfig();
      this.writeToAuthConfigFile();
      return;
    }

    this.updateAuthConfig({
      type: 'oauth',
      token: tokens.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    });

    if (tokens.refresh_token) {
      this.updateAuthConfig({ refreshToken: tokens.refresh_token });
    }

    this.writeToAuthConfigFile();
    this.writeToConfigFile();

    output.debug('Tokens refreshed successfully.');
  }

  updateConfig(config: Partial<GlobalConfig>) {
    this.config = { ...this.config, ...config };
  }

  writeToConfigFile() {
    writeToConfigFile(this.config);
  }

  updateAuthConfig(authConfig: Partial<AuthConfig>) {
    this.authConfig = { ...this.authConfig, ...authConfig };
  }

  emptyAuthConfig() {
    this.authConfig = {};
  }

  writeToAuthConfigFile() {
    writeToAuthConfigFile(this.authConfig);
  }

  private async _fetch(_url: string, opts: FetchOptions = {}) {
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

    await this.ensureAuthorized();

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
    return output.time(
      res => {
        if (res) {
          return `#${requestId} ← ${res.status} ${
            res.statusText
          }: ${res.headers.get('x-vercel-id')}`;
        } else {
          return `#${requestId} → ${opts.method || 'GET'} ${url.href}`;
        }
      },
      fetch(url, { agent: this.agent, ...opts, headers, body })
    );
  }

  fetch(url: string, opts: FetchOptions & { json: false }): Promise<Response>;
  fetch<T>(url: string, opts?: FetchOptions): Promise<T>;
  fetch(url: string, opts: FetchOptions = {}) {
    return this.retry(async bail => {
      const res = await this._fetch(url, opts);

      printIndications(res);

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
        output.prettyError(error);
      } else {
        output.error(
          `Failed to re-authenticate for ${bold(error.scope)} scope`
        );
      }
      throw error;
    }

    this.authConfig.token = result.token;
    writeToAuthConfigFile(this.authConfig);
  });

  _onRetry = (error: Error) => {
    output.debug(`Retrying: ${error}\n${error.stack}`);
  };

  get cwd(): string {
    return process.cwd();
  }

  set cwd(v: string) {
    process.chdir(v);
  }
}
