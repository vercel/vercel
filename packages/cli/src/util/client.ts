import { bold, gray, red, yellow, bgRed, white } from 'chalk';
import type checkbox from '@inquirer/checkbox';
import type expand from '@inquirer/expand';
import type input from '@inquirer/input';
import type password from '@inquirer/password';
import type search from '@inquirer/search';
import type select from '@inquirer/select';
import { join, resolve } from 'node:path';
import { EventEmitter } from 'events';
import { URL } from 'url';
import type { VercelConfig } from '@vercel/client';
import {
  getGlobalPathConfig as getSharedGlobalPathConfig,
  readConfigFile as readSharedConfigFile,
  writeConfigFile as writeSharedConfigFile,
} from '@vercel/cli-config';
import retry, {
  type RetryFunction,
  type Options as RetryOptions,
} from 'async-retry';
import fetch, { type BodyInit, type RequestInit, type Response } from './fetch';
import pkg from './pkg';
import ua from './ua';
import responseError from './response-error';
import printIndications from './print-indications';
import type { SAMLError } from './login/types';
import { persistAuthConfig, writeToConfigFile } from './config/files';
import type { TelemetryEventStore } from './telemetry';
import type { Span } from '@vercel/build-utils';
import type {
  AuthConfig,
  GlobalConfig,
  JSONObject,
  Team,
  Stdio,
  ReadableTTY,
  PaginationOptions,
  User,
} from '@vercel-internals/types';
import { sharedPromise } from './promise';
import { APIError } from './errors-ts';
import { normalizeError } from '@vercel/error-utils';
import sleep from './sleep';
import type * as tty from 'tty';
import type { z } from 'zod';
import output from '../output-manager';
import { parseArguments } from './get-args';
import {
  isOAuthError,
  processTokenResponse,
  refreshTokenRequest,
} from './oauth';
import {
  PromptBackError,
  PromptCanceledError,
} from './input/prompt-cancellation';

/**
 * `config.currentTeam` while an agent run has no team yet. It's empty, so code
 * that checks for a team treats it as none, and `fetch` and `getScope` call
 * `chooseTeam` before sending a request.
 */
export const TEAM_NOT_CHOSEN = '';

const DOMAINS_API_PATH = /^\/v\d+\/(?:domains|registrar)(?:\/|$)/;

const isSAMLError = (v: any): v is SAMLError => {
  return v && v.saml;
};

type ParsedArgsCache = {
  args: string[];
  flags: Record<string, string | boolean | undefined>;
};

type CancelablePrompt<T> = Promise<T> & {
  cancel?: () => void;
};

export interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | JSONObject;
  json?: boolean;
  retry?: RetryOptions;
  useCurrentTeam?: boolean;
  /**
   * The endpoint works without a team (public data). A run that ignores the
   * saved team and hasn't chosen one sends it without a team instead of
   * stopping to choose; otherwise the current team is sent as usual.
   */
  teamOptional?: boolean;
  accountId?: string;
  /** When true, 429 responses are returned immediately instead of waiting for Retry-After and retrying */
  bailOn429?: boolean;
}

export interface ClientOptions extends Stdio {
  argv: string[];
  apiUrl: string;
  authConfig: AuthConfig;
  config: GlobalConfig;
  localConfig?: VercelConfig;
  localConfigPath?: string;
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
  private _argv: string[] = [];
  apiUrl: string;
  authConfig: AuthConfig;
  stdin: ReadableTTY;
  stdout: tty.WriteStream;
  stderr: tty.WriteStream;
  config: GlobalConfig;
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
  /**
   * The team saved in the global config for the human (`vc switch`, login).
   * Runs that ignore it (see `ignoresSavedTeam`) write it back unchanged when
   * they save the config, so their own team never replaces it.
   */
  savedTeam: string | undefined;
  /**
   * Whether this run ignores the team saved for the human: an agent that
   * can't prompt. An agent attached to a terminal may have a human answering,
   * so it keeps the saved team like any interactive run. Decided once at
   * startup, so a command that turns off prompts mid-run (`project token`)
   * can't change which team the run uses.
   */
  ignoresSavedTeam: boolean;
  /** A team choice in flight, shared by requests that start meanwhile. */
  private teamChoice?: Promise<void>;
  /** Dangerously skip all permission prompts (--dangerously-skip-permissions flag) */
  dangerouslySkipPermissions: boolean;
  /** Root trace span for CLI diagnostics */
  rootSpan?: Span;
  /** Path to write CLI trace diagnostics. Only set by `vc build`; other commands do not write traces. */
  traceDiagnosticsPath?: string;
  /** Track if we've already logged the token source debug message */
  private _loggedTokenSource: boolean = false;
  private _parsedArgsCache?: ParsedArgsCache;
  private escapePromptCancellationDepth = 0;
  private promptBackNavigationDepth = 0;
  /** Request-scoped identity caches used to avoid repeated scope lookups. */
  user?: User;
  userPromise?: Promise<User>;
  teams?: Team[];
  teamsPromise?: Promise<Team[]>;

  constructor(opts: ClientOptions) {
    super();
    this.setArgv(opts.argv);
    this.apiUrl = opts.apiUrl;
    this.authConfig = opts.authConfig;
    this.stdin = opts.stdin;
    this.stdout = opts.stdout;
    this.stderr = opts.stderr;
    this.config = opts.config;
    this.savedTeam = opts.config.currentTeam;
    this.localConfig = opts.localConfig;
    this.localConfigPath = opts.localConfigPath;
    this.requestIdCounter = 1;
    this.telemetryEventStore = opts.telemetryEventStore;
    this.isAgent = opts.isAgent ?? false;
    this.agentName = opts.agentName;
    this.nonInteractive = opts.nonInteractive ?? this.isAgent;
    this.ignoresSavedTeam = this.isAgent && this.nonInteractive;
    this.dangerouslySkipPermissions = opts.dangerouslySkipPermissions ?? false;

    const theme = {
      prefix: gray('?'),
      style: { answer: gray },
    };
    this.input = {
      text: async (opts: Parameters<typeof input>[0]) => {
        const { default: input } = await import('@inquirer/input');
        return this.runPrompt(
          input({ theme, ...opts }, { input: this.stdin, output: this.stderr })
        );
      },
      password: async (opts: Parameters<typeof password>[0]) => {
        const { default: password } = await import('@inquirer/password');
        return this.runPrompt(
          password(
            { theme, ...opts },
            { input: this.stdin, output: this.stderr }
          )
        );
      },
      checkbox: async <T>(opts: Parameters<typeof checkbox<T>>[0]) => {
        const { default: checkbox } = await import('@inquirer/checkbox');
        return this.runPrompt(
          checkbox<T>(
            { theme, ...opts },
            { input: this.stdin, output: this.stderr }
          )
        );
      },
      expand: async (opts: Parameters<typeof expand>[0]) => {
        const { default: expand } = await import('@inquirer/expand');
        return this.runPrompt(
          expand({ theme, ...opts }, { input: this.stdin, output: this.stderr })
        );
      },
      confirm: async (
        message: string,
        default_value: boolean,
        opts?: { signal?: AbortSignal }
      ) => {
        const { default: confirm } = await import('@inquirer/confirm');
        const prompt = confirm(
          { theme, message, default: default_value },
          { input: this.stdin, output: this.stderr }
        );
        // This `@inquirer/core` version takes no `signal`, so cancel instead.
        const signal = opts?.signal;
        const cancel = () => prompt.cancel();
        if (signal?.aborted) cancel();
        signal?.addEventListener('abort', cancel, { once: true });
        return this.runPrompt(prompt).finally(() =>
          signal?.removeEventListener('abort', cancel)
        );
      },
      select: async <T>(opts: Parameters<typeof select<T>>[0]) => {
        const { default: select } = await import('@inquirer/select');
        return this.runPrompt(
          select<T>(
            { theme, ...opts },
            { input: this.stdin, output: this.stderr }
          )
        );
      },
      search: async <T>(opts: Parameters<typeof search<T>>[0]) => {
        const { default: search } = await import('@inquirer/search');
        return this.runPrompt(
          search<T>(
            { theme, ...opts },
            { input: this.stdin, output: this.stderr }
          )
        );
      },
    };
  }

  async withEscapePromptCancellation<T>(run: () => Promise<T>): Promise<T> {
    this.escapePromptCancellationDepth++;
    try {
      return await run();
    } finally {
      this.escapePromptCancellationDepth--;
    }
  }

  async withPromptBackNavigation<T>(run: () => Promise<T>): Promise<T> {
    this.promptBackNavigationDepth++;
    try {
      return await run();
    } finally {
      this.promptBackNavigationDepth--;
    }
  }

  private runPrompt<T>(prompt: CancelablePrompt<T>): Promise<T> {
    const escapeCancellationEnabled = this.escapePromptCancellationDepth > 0;
    const backNavigationEnabled = this.promptBackNavigationDepth > 0;

    if (
      (!escapeCancellationEnabled && !backNavigationEnabled) ||
      !this.stdin.isTTY ||
      !prompt.cancel
    ) {
      return prompt;
    }

    let cancellation: 'escape' | 'back' | undefined;
    const onKeypress = (
      _input: string | undefined,
      key: { name?: string } | undefined
    ) => {
      if (
        key?.name === 'escape' &&
        escapeCancellationEnabled &&
        !cancellation
      ) {
        cancellation = 'escape';
        prompt.cancel?.();
      } else if (key?.name === 'up' && backNavigationEnabled && !cancellation) {
        cancellation = 'back';
        prompt.cancel?.();
      }
    };

    this.stdin.on('keypress', onKeypress);

    return prompt
      .catch(error => {
        if (cancellation === 'escape') {
          throw new PromptCanceledError();
        }
        if (cancellation === 'back') {
          throw new PromptBackError();
        }
        throw error;
      })
      .finally(() => {
        this.stdin.off('keypress', onKeypress);
      });
  }

  get argv(): string[] {
    return this._argv;
  }

  setArgv(argv: string[]): void;
  setArgv(...argv: string[]): void;
  setArgv(argvOrFirst: string[] | string, ...rest: string[]) {
    const argv = Array.isArray(argvOrFirst)
      ? argvOrFirst
      : [argvOrFirst, ...rest];

    this._argv = argv;
    this._parsedArgsCache = undefined;
  }

  private getParsedArgs(): ParsedArgsCache {
    if (!this._parsedArgsCache) {
      this._parsedArgsCache = parseArguments(
        this.argv.slice(2),
        {},
        {
          permissive: true,
        }
      ) as ParsedArgsCache;
    }

    return this._parsedArgsCache;
  }

  retry<T>(fn: RetryFunction<T>, { retries = 3, maxTimeout = Infinity } = {}) {
    return retry(fn, {
      retries,
      maxTimeout,
      onRetry: this._onRetry,
    });
  }

  /**
   * Refresh an expired access token, recovering the saved login interactively
   * when possible. Unrecoverable token responses clear the saved credentials;
   * transport and persistence errors propagate to the caller.
   *
   * Call before copying the token into clients that do not use `fetch()`.
   */
  async ensureAuthorized(): Promise<void> {
    const { authConfig } = this;

    // If we have a valid access token, do nothing
    if (isValidAccessToken(authConfig)) {
      if (!this._loggedTokenSource) {
        if (authConfig.tokenSource === 'flag') {
          output.debug(
            'Using token from the `--token` option, skipping token refresh.'
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
      this.persistAuthConfig();
      return;
    }

    const tokenResponse = await refreshTokenRequest({
      refresh_token: authConfig.refreshToken,
    });

    const [tokensError, tokens] = await processTokenResponse(tokenResponse);

    // CLI versions before 56.4.1 could persist a rotated access token without
    // its matching refresh token after step-up authentication. Once that
    // access token expires, recover the interactive stored session here so
    // commands such as `vercel link` do not fail before their first API call.
    if (
      isOAuthError(tokensError) &&
      tokensError.code === 'invalid_grant' &&
      !authConfig.tokenSource &&
      this.stdin.isTTY &&
      !this.nonInteractive
    ) {
      output.debug(
        `Stored session refresh failed: ${tokensError.cause.message}`
      );
      output.log("Couldn't refresh the saved login. Starting a new login.");
      const { performDeviceCodeFlow } = await import(
        '../commands/login/future'
      );
      const recoveredTokens = await performDeviceCodeFlow(this);
      if (recoveredTokens) {
        this.updateAuthConfig({
          token: recoveredTokens.access_token,
          userId: undefined,
          expiresAt: Math.floor(Date.now() / 1000) + recoveredTokens.expires_in,
          refreshToken: recoveredTokens.refresh_token,
        });
        this.persistAuthConfig();
        return;
      }
    }

    // If we had an error, during the refresh process, empty the auth config
    // to force the user to re-authenticate
    if (tokensError) {
      output.debug('Error refreshing token, emptying auth config.');
      this.emptyAuthConfig();
      this.persistAuthConfig();
      return;
    }

    // Token refresh does not change the authenticated user, so the cached
    // userId is intentionally preserved here.
    this.updateAuthConfig({
      token: tokens.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    });

    if (tokens.refresh_token) {
      this.updateAuthConfig({ refreshToken: tokens.refresh_token });
    }

    this.persistAuthConfig();
    this.writeToConfigFile();

    output.debug('Tokens refreshed successfully.');
  }

  getGlobalPathConfig(): string {
    const confFlag = this.getParsedArgs().flags['--global-config'];

    if (typeof confFlag === 'string') {
      return resolve(this.cwd, confFlag);
    }

    return getSharedGlobalPathConfig();
  }

  async readConfig<S extends z.ZodType>(
    fileName: string,
    schema: S
  ): Promise<z.output<S>> {
    const filePath = join(this.getGlobalPathConfig(), fileName);
    return readSharedConfigFile(filePath, schema);
  }

  async maybeReadConfig<S extends z.ZodType>(
    fileName: string,
    schema: S
  ): Promise<z.output<S> | null> {
    try {
      return await this.readConfig(fileName, schema);
    } catch {
      return null;
    }
  }

  async writeConfig<S extends z.ZodType>(
    fileName: string,
    schema: S,
    value: z.output<S>
  ): Promise<void> {
    const filePath = join(this.getGlobalPathConfig(), fileName);
    writeSharedConfigFile(filePath, schema, value);
  }

  updateConfig(config: Partial<GlobalConfig>) {
    this.config = { ...this.config, ...config };
    if ('currentTeam' in config) {
      this.savedTeam = config.currentTeam;
    }
  }

  writeToConfigFile(config: GlobalConfig = this.config) {
    writeToConfigFile(
      this.ignoresSavedTeam
        ? { ...config, currentTeam: this.savedTeam }
        : config
    );
  }

  /** Whether this run ignores the saved team and hasn't chosen one yet. */
  isTeamUnchosen(): boolean {
    return this.ignoresSavedTeam && this.config.currentTeam === TEAM_NOT_CHOSEN;
  }

  /**
   * Whether a request would send this run's team before one is chosen: it
   * names no account or `teamId` of its own and doesn't opt out (see the
   * matching branch in `_fetch`).
   */
  private needsTeamChoice(url: string, opts: FetchOptions): boolean {
    return (
      this.isTeamUnchosen() &&
      !opts.teamOptional &&
      !opts.accountId &&
      opts.useCurrentTeam !== false &&
      !new URL(url, this.apiUrl).searchParams.has('teamId')
    );
  }

  /**
   * Chooses the team for a run that ignores the saved team (see
   * `resolveAgentTeam`). Callers that start while a choice is in flight share
   * it. With `ask: false`, several teams leave it unchosen instead of
   * stopping with `missing_scope`.
   */
  chooseTeam({ ask = true }: { ask?: boolean } = {}): Promise<void> {
    if (!ask) {
      return this.applyTeamChoice(false);
    }
    this.teamChoice ??= this.applyTeamChoice(true).finally(() => {
      this.teamChoice = undefined;
    });
    return this.teamChoice;
  }

  private async applyTeamChoice(ask: boolean): Promise<void> {
    const { resolveAgentTeam } = await import('./resolve-agent-team');
    const team = await resolveAgentTeam(this, { ask });
    if (team !== null && this.isTeamUnchosen()) {
      this.config.currentTeam = team;
    }
  }

  /**
   * This run's team, choosing it first if the run ignores the saved team and
   * hasn't picked one yet. For code that needs the team before any request.
   * With `ask: false`, returns `undefined` instead of stopping to ask when
   * the team can't be told.
   */
  async resolveCurrentTeam({
    ask = true,
  }: {
    ask?: boolean;
  } = {}): Promise<string | undefined> {
    if (this.isTeamUnchosen()) {
      await this.chooseTeam({ ask });
    }
    return this.isTeamUnchosen() ? undefined : this.config.currentTeam;
  }

  updateAuthConfig(authConfig: Partial<AuthConfig>) {
    if (authConfig.token && authConfig.token !== this.authConfig.token) {
      this.user = undefined;
      this.userPromise = undefined;
      this.teams = undefined;
      this.teamsPromise = undefined;
    }
    this.authConfig = { ...this.authConfig, ...authConfig };
  }

  emptyAuthConfig() {
    this.user = undefined;
    this.userPromise = undefined;
    this.teams = undefined;
    this.teamsPromise = undefined;
    this.authConfig = this.authConfig.skipWrite ? { skipWrite: true } : {};
  }

  persistAuthConfig() {
    persistAuthConfig(this.authConfig, this.config);
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
          `  An AI agent${agentInfo} is executing a ${bold('DELETE')} request with --dangerously-skip-permissions option.\n`
        )
      );
      output.print(yellow(`  This operation will delete data: ${bold(url)}\n`));
      output.print(
        yellow(
          `  The --dangerously-skip-permissions option has bypassed the confirmation prompt.\n\n`
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
      } else if (
        opts.useCurrentTeam !== false &&
        this.config.currentTeam &&
        !url.searchParams.has('teamId')
      ) {
        url.searchParams.set('teamId', this.config.currentTeam);
      }
    }

    const headers = new globalThis.Headers(opts.headers);
    headers.set('user-agent', ua);
    if (DOMAINS_API_PATH.test(url.pathname)) {
      headers.set('x-vercel-cli-version', pkg.version);
    }
    if (this.agentName) {
      headers.set('x-ai-agent', this.agentName);
    }
    headers.set(
      'x-vercel-cli-session-id',
      this.telemetryEventStore.currentSessionId
    );
    headers.set(
      'x-vercel-cli-invocation-id',
      this.telemetryEventStore.currentInvocationId
    );

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
      fetch(url, { ...opts, headers, body })
    );
  }

  fetch(url: string, opts: FetchOptions & { json: false }): Promise<Response>;
  fetch<T>(url: string, opts?: FetchOptions): Promise<T>;
  async fetch(url: string, opts: FetchOptions = {}) {
    // Never send a request without a team the run chose: an empty `teamId`
    // silently targets the personal account. Choose before the retry loop so
    // a failure here (a revoked token) isn't retried.
    if (this.needsTeamChoice(url, opts)) {
      await this.chooseTeam();
    }

    return this.retry(async bail => {
      let res: Awaited<ReturnType<Client['_fetch']>>;
      try {
        res = await this._fetch(url, opts);
      } catch (err: unknown) {
        // `TimeoutError` as well as `AbortError`: a deadline set with
        // `AbortSignal.timeout()` rejects under the former name, and the
        // signal stays aborted afterwards. Retrying one is three more round
        // trips that cannot do anything but reject again on a dead signal —
        // and against a metered API, three more against the caller's quota.
        if (
          err instanceof Error &&
          (err.name === 'AbortError' || err.name === 'TimeoutError')
        ) {
          return bail(err);
        }
        throw err;
      }

      printIndications(res);

      if (!res.ok) {
        // Return 3xx responses directly when manual redirect is requested
        if (
          opts.redirect === 'manual' &&
          res.status >= 300 &&
          res.status < 400
        ) {
          return res;
        }

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
        } else if (res.status === 429 && opts.bailOn429) {
          return bail(error);
        } else if (typeof error.retryAfterMs === 'number') {
          if (opts.retry?.retries === 0) {
            return bail(error);
          }
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
    const { default: reauthenticate } = await import('./login/reauthenticate');
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
