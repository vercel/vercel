import { bold, gray, red, yellow, bgRed, white } from 'chalk';
import checkbox from '@inquirer/checkbox';
import confirm from '@inquirer/confirm';
import expand from '@inquirer/expand';
import input from '@inquirer/input';
import password from '@inquirer/password';
import search from '@inquirer/search';
import select from '@inquirer/select';
import { EventEmitter } from 'events';
import { URL } from 'url';
import type { VercelConfig } from '@vercel/client';
import retry, {
  type RetryFunction,
  type Options as RetryOptions,
} from 'async-retry';
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
} from '@vercel-internals/types';
import { sharedPromise } from './promise';
import { APIError } from './errors-ts';
import { normalizeError } from '@vercel/error-utils';
import type { Dispatcher } from 'undici';
import sleep from './sleep';
import type * as tty from 'tty';
import output from '../output-manager';
import { processTokenResponse, refreshTokenRequest } from './oauth';

const isSAMLError = (v: any): v is SAMLError => {
  return v && v.saml;
};

export interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: RequestInit['body'] | JSONObject;
  duplex?: 'half';
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
  dispatcher?: Dispatcher;
  telemetryEventStore: TelemetryEventStore;
  /** Whether the CLI is being run by an AI agent */
  isAgent?: boolean;
  /** Name of the agent running the CLI (e.g., 'claude', 'cursor') */
  agentName?: string;
  /** Run without interactive prompts; true when --non-interactive or when agent is detected */
  nonInteractive?: boolean;
  /** Dangerously skip all permission prompts (--dangerously-skip-permissions flag) */
  dangerouslySkipPermissions?: boolean;
}

export const isJSONObject = (v: any): v is JSONObject => {
  return v && typeof v == 'object' && v.constructor === Object;
};

export function isValidAccessToken(authConfig: AuthConfig): boolean {
  if (!authConfig.token) return false;

  // When `--token` is passed to a command, `expiresAt` will be missing.
  // We assume the token is valid in this case and handle errors further down.
  if (typeof authConfig.expiresAt !== 'number') return true;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  return authConfig.expiresAt >= nowInSeconds;
}

export function hasRefreshToken(
  authConfig: AuthConfig
): authConfig is AuthConfig & { refreshToken: string } {
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
  dispatcher?: Dispatcher;
  localConfig?: VercelConfig;
  localConfigPath?: string;
  requestIdCounter: number;
  input;
  telemetryEventStore: TelemetryEventStore;
  /** Whether the CLI is being run by an AI agent */
  isAgent: boolean;
  /** Name of the agent running the CLI */
  agentName?: string;
  /** Run without interactive prompts; true when --non-interactive or when agent is detected */
  nonInteractive: boolean;
  /** Dangerously skip all permission prompts (--dangerously-skip-permissions flag) */
  dangerouslySkipPermissions: boolean;
  /** Track if we've already logged the token source debug message */
  private _loggedTokenSource: boolean = false;

  constructor(opts: ClientOptions) {
    super();
    this.dispatcher = opts.dispatcher;
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
    this.isAgent = opts.isAgent ?? false;
    this.agentName = opts.agentName;
    this.nonInteractive = opts.nonInteractive ?? this.isAgent;
    this.dangerouslySkipPermissions = opts.dangerouslySkipPermissions ?? false;

    const theme = {
      prefix: gray('?'),
      style: { answer: gray },
    };
    this.input = {
      text: (opts: Parameters<typeof input>[0]) =>
        input({ theme, ...opts }, { input: this.stdin, output: this.stderr }),
      password: (opts: Parameters<typeof password>[0]) =>
        password(
          { theme, ...opts },
          { input: this.stdin, output: this.stderr }
        ),
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
      search: <T>(opts: Parameters<typeof search<T>>[0]) =>
        search<T>(
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
   * This method silently tries to refresh the access_token if it is expired.
   *
   * If the refresh_token is also expired, it will not attempt to refresh it.
   * If there is any error during the refresh process, it will not throw an error.
   */
  private async ensureAuthorized(): Promise<void> {
    const { authConfig } = this;

    // If we have a valid access token, do nothing
    if (isValidAccessToken(authConfig)) {
      if (!this._loggedTokenSource) {
        if (authConfig.tokenSource === 'flag') {
          output.debug(
            'Using token from `--token` argument, skipping token refresh.'
          );
        } else if (authConfig.tokenSource === 'env') {
          output.debug(
            'Using token from VERCEL_TOKEN environment variable, skipping token refresh.'
          );
        } else {
          output.debug('Valid access token, skipping token refresh.');
        }
        this._loggedTokenSource = true;
      }
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

  /**
   * Confirms DELETE operations with the user.
   *
   * - DELETE operations always require confirmation (unless --dangerously-skip-permissions is used)
   * - When running under an AI agent with --dangerously-skip-permissions,
   *   a warning is displayed for visibility
   *
   * @returns true if the operation should proceed, false if canceled
   */
  async confirmMutatingOperation(
    url: string,
    method: string | undefined
  ): Promise<boolean> {
    const normalizedMethod = (method || 'GET').toUpperCase();
    const isDelete = normalizedMethod === 'DELETE';

    // Only DELETE operations require confirmation
    if (!isDelete) {
      return true;
    }

    // Show agent mode warning when --dangerously-skip-permissions is used
    if (this.isAgent && this.dangerouslySkipPermissions) {
      const agentInfo = this.agentName ? ` (${this.agentName})` : '';
      output.print('\n');
      output.print(
        bgRed(white(bold(' ⚠ WARNING '))) +
          red(bold(' AGENT MODE - DELETE CONFIRMATION BYPASSED\n'))
      );
      output.print(
        yellow(
          `  An AI agent${agentInfo} is executing a ${bold('DELETE')} request with --dangerously-skip-permissions flag.\n`
        )
      );
      output.print(yellow(`  This operation will delete data: ${bold(url)}\n`));
      output.print(
        yellow(
          `  The --dangerously-skip-permissions flag has bypassed the confirmation prompt.\n\n`
        )
      );
    }

    // If --dangerously-skip-permissions flag is set, skip confirmation
    if (this.dangerouslySkipPermissions) {
      return true;
    }

    // Check if we have a TTY for interactive prompts
    if (!this.stdin.isTTY) {
      output.error(
        `DELETE operations require confirmation. Use ${bold('--dangerously-skip-permissions')} to skip confirmation in non-interactive mode.`
      );
      return false;
    }

    // Prompt for DELETE confirmation
    const message = `You are about to perform a ${red(bold('DELETE'))} operation on:\n  ${bold(url)}\n\nAre you sure you want to proceed?`;

    output.print('\n');
    const confirmed = await this.input.confirm(message, false);
    output.print('\n');

    if (!confirmed) {
      output.log('Operation canceled by user.');
    }

    return confirmed;
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
    // The built-in fetch requires duplex: 'half' when body is a stream
    const fetchOpts: Record<string, unknown> = { ...opts, headers, body };
    if (body && typeof body === 'object' && 'pipe' in body) {
      fetchOpts.duplex = 'half';
    }
    if (this.dispatcher) {
      fetchOpts.dispatcher = this.dispatcher;
    }
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
      fetch(url, fetchOpts as RequestInit)
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
        } else if (typeof error.retryAfterMs === 'number') {
          // Respect the Retry-After header and then try again below.
          // This covers 429 responses which would otherwise bail out
          //
          // The `Retry-After` header from the api tells us when the next rate
          // limit token is available. There may only be a single rate limit
          // token available at that time. Add a random skew to prevent creating
          // a thundering herd.
          //
          // Many of our APIs use 1 minute rate limit buckets, so 30s of skew is
          // likely more than enough.
          //
          // Note: The `async-retry` library already provides some random skew
          // by default, but it provides much less skew, because it's not aware
          // of rate limits.
          const randomSkewMs = 30_000 * Math.random();
          await sleep(error.retryAfterMs + randomSkewMs);
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
