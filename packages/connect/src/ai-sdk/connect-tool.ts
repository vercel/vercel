import {
  tool,
  type FlexibleSchema,
  type InferSchema,
  type Tool,
  type ToolExecutionOptions,
} from 'ai';

/**
 * Tool execution context shape. Mirrors the AI SDK's internal `Context`
 * type (`Record<string, unknown>`), which `ai` does not re-export.
 */
type Context = Record<string, unknown>;
import { startAuthorization } from '../authorization.js';
import { ConsentRequiredError } from '../consent.js';
import {
  getToken,
  UserAuthorizationRequiredError,
  type ConnectTokenParams,
  type ConnectTokenSubject,
} from '../token.js';

/** A `fetch`-compatible function. */
type FetchLike = typeof globalThis.fetch;

/** Resolves the Vercel OIDC token, accepting either a value or a thunk. */
type VercelTokenResolver = string | (() => string | Promise<string>);

async function resolveVercelToken(
  resolver: VercelTokenResolver | undefined
): Promise<string | undefined> {
  return typeof resolver === 'function' ? resolver() : resolver;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isConnectSubject(value: unknown): value is ConnectTokenSubject {
  return isRecord(value) && typeof value.type === 'string';
}

/** Shared connector-token configuration for the direct-tool helpers. */
interface ConnectTokenConfig {
  /** OAuth scopes to request for the token. */
  scopes?: string[];
  /**
   * Additional Connect token parameters (`audience`, `resources`,
   * `installationId`, `authorizationDetails`, …). `subject` and `scopes`
   * are supplied separately.
   */
  tokenParams?: Omit<ConnectTokenParams, 'subject' | 'scopes'>;
  /**
   * Where Connect returns the user after they grant access. Forwarded to
   * `startAuthorization` as `callbackUrl` when a consent challenge is
   * minted. When omitted, Connect falls back to the connector's
   * server-side registered redirect.
   */
  callbackUrl?: string;
  /**
   * Override the Vercel OIDC token used to authenticate against the
   * Connect API. Accepts a thunk because tools are long-lived and a
   * captured string would go stale. Defaults to the `@vercel/oidc`
   * resolver used by the rest of `@vercel/connect`.
   */
  vercelToken?: VercelTokenResolver;
}

function buildTokenParams(
  subject: ConnectTokenSubject,
  config: ConnectTokenConfig
): ConnectTokenParams {
  return {
    subject,
    ...(config.scopes !== undefined && { scopes: config.scopes }),
    ...config.tokenParams,
  };
}

/**
 * Acquire a Connect access token, translating the "not authorized yet"
 * signal into a {@link ConsentRequiredError} that already carries the
 * hosted consent URL (minted via `startAuthorization`).
 */
async function acquireAccessToken(
  connector: string,
  subject: ConnectTokenSubject,
  config: ConnectTokenConfig
): Promise<string> {
  const vercelToken = await resolveVercelToken(config.vercelToken);
  const params = buildTokenParams(subject, config);
  try {
    return await getToken(
      connector,
      params,
      vercelToken !== undefined ? { vercelToken } : undefined
    );
  } catch (err) {
    if (err instanceof UserAuthorizationRequiredError) {
      const auth = await startAuthorization(connector, params, {
        ...(vercelToken !== undefined && { vercelToken }),
        ...(config.callbackUrl !== undefined && {
          callbackUrl: config.callbackUrl,
        }),
      });
      throw new ConsentRequiredError({
        connector,
        subject,
        url: auth.url,
        request: auth.request,
        verifier: auth.verifier,
        deviceCode: auth.deviceCode,
        expiresAt: auth.expiresAt,
      });
    }
    throw err;
  }
}

/** Options accepted by {@link connectFetch}. */
export interface ConnectFetchOptions extends ConnectTokenConfig {
  /**
   * Base `fetch` implementation to wrap. Defaults to the global `fetch`.
   * Useful for tests or non-standard runtimes.
   */
  fetch?: FetchLike;
}

/**
 * Build a `fetch` that automatically attaches the Connect access token
 * for `connector`/`subject` as an `Authorization: Bearer` header.
 *
 * When the user has not yet authorized the connector, the returned
 * `fetch` throws {@link ConsentRequiredError} (carrying the hosted
 * consent URL) instead of issuing an unauthenticated request. An
 * explicit `Authorization` header on the request is preserved.
 *
 * ```ts
 * const fetchLinear = connectFetch('oauth/linear', subject, {
 *   scopes: ['read'],
 *   callbackUrl: `${origin}/api/connect/linear/callback`,
 * });
 * const res = await fetchLinear('https://api.linear.app/graphql', { ... });
 * ```
 */
export function connectFetch(
  connector: string,
  subject: ConnectTokenSubject,
  options: ConnectFetchOptions = {}
): FetchLike {
  const baseFetch = options.fetch ?? globalThis.fetch;
  return async (input, init) => {
    const token = await acquireAccessToken(connector, subject, options);
    const headers = new Headers(init?.headers);
    if (input instanceof Request) {
      for (const [key, value] of input.headers) {
        if (!headers.has(key)) headers.set(key, value);
      }
    }
    if (!headers.has('authorization')) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return baseFetch(input, { ...init, headers });
  };
}

/**
 * Standardized tool output returned by {@link connectTool} when the user
 * still needs to authorize the connector. Render it in the UI as a
 * "Connect" button pointing at `url`; the model also sees it and can
 * explain that authorization is required.
 */
export interface ConnectRequiredOutput {
  status: 'connect_required';
  connector: string;
  url: string;
  message: string;
  deviceCode?: string;
  expiresAt?: number;
}

/** Resolve the token subject from static config or per-request context. */
export type ConnectToolSubject<CONTEXT> =
  | ConnectTokenSubject
  | ((
      options: ToolExecutionOptions<CONTEXT>
    ) => ConnectTokenSubject | Promise<ConnectTokenSubject>);

/** Execution options handed to a {@link connectTool} `execute` function. */
export interface ConnectToolExecuteOptions<CONTEXT>
  extends ToolExecutionOptions<CONTEXT> {
  /** A `fetch` that auto-attaches the Connect access token (see {@link connectFetch}). */
  fetch: FetchLike;
  /** The connector this tool is bound to. */
  connector: string;
  /** Resolve the raw access token directly. Prefer `fetch` where possible. */
  getAccessToken: () => Promise<string>;
}

/** Configuration for {@link connectTool}. */
export interface ConnectToolConfig<
  SCHEMA extends FlexibleSchema,
  OUTPUT,
  CONTEXT extends Context = Context,
> extends ConnectFetchOptions {
  /** Vercel Connect connector UID (e.g. `oauth/linear`) or connector id. */
  connector: string;
  /**
   * The token subject. May be a value, or a function resolved per call.
   * When omitted, the subject is read from the AI SDK execution context
   * (`options.context.connectSubject`), which lets you bind the current
   * user per request via `streamText`'s `toolsContext`.
   */
  subject?: ConnectToolSubject<CONTEXT>;
  /** Tool description shown to the model. */
  description?: string;
  /** Optional human-facing tool title. */
  title?: string;
  /** Zod (or AI SDK) schema for the tool input. */
  inputSchema: SCHEMA;
  /** Optional schema for the tool output. */
  outputSchema?: FlexibleSchema<OUTPUT>;
  /**
   * The tool body. Receives the validated input and execution options
   * augmented with a token-injecting `fetch`.
   */
  execute: (
    input: InferSchema<SCHEMA>,
    options: ConnectToolExecuteOptions<CONTEXT>
  ) => OUTPUT | PromiseLike<OUTPUT>;
  /**
   * Override how a missing grant is surfaced. By default `connectTool`
   * returns a {@link ConnectRequiredOutput}. Provide this to return a
   * custom shape or to rethrow.
   */
  onConsentRequired?: (
    error: ConsentRequiredError,
    options: ToolExecutionOptions<CONTEXT>
  ) =>
    | OUTPUT
    | ConnectRequiredOutput
    | PromiseLike<OUTPUT | ConnectRequiredOutput>;
}

async function resolveSubject<
  SCHEMA extends FlexibleSchema,
  OUTPUT,
  CONTEXT extends Context,
>(
  config: ConnectToolConfig<SCHEMA, OUTPUT, CONTEXT>,
  options: ToolExecutionOptions<CONTEXT>
): Promise<ConnectTokenSubject> {
  const { subject } = config;
  if (typeof subject === 'function') return subject(options);
  if (subject !== undefined) return subject;

  const context: unknown = options.context;
  if (isRecord(context) && isConnectSubject(context.connectSubject)) {
    return context.connectSubject;
  }

  throw new Error(
    `connectTool("${config.connector}"): no token subject available. Pass \`subject\` in the config, or set \`connectSubject\` in the streamText \`toolsContext\`.`
  );
}

/**
 * Create an AI SDK tool that talks to a third-party API authorized
 * through Vercel Connect. The tool body gets a token-injecting `fetch`,
 * and a missing grant is turned into a {@link ConnectRequiredOutput} the
 * UI can render as a "Connect" button — so authors only write the happy
 * path.
 *
 * ```ts
 * import { connect } from '@vercel/connect/ai-sdk';
 *
 * const linearWhoami = connect.tool({
 *   connector: 'oauth/linear',
 *   scopes: ['read'],
 *   subject: { type: 'user', id: userId },
 *   description: 'Return the authenticated Linear user.',
 *   inputSchema: z.object({}),
 *   execute: async (_input, { fetch }) => {
 *     const res = await fetch('https://api.linear.app/graphql', {
 *       method: 'POST',
 *       headers: { 'content-type': 'application/json' },
 *       body: JSON.stringify({ query: '{ viewer { id name email } }' }),
 *     });
 *     return (await res.json()).data.viewer;
 *   },
 * });
 * ```
 */
export function connectTool<
  SCHEMA extends FlexibleSchema,
  OUTPUT,
  CONTEXT extends Context = Context,
>(
  config: ConnectToolConfig<SCHEMA, OUTPUT, CONTEXT>
): Tool<InferSchema<SCHEMA>, OUTPUT | ConnectRequiredOutput> {
  const tokenConfig: ConnectFetchOptions = {
    scopes: config.scopes,
    tokenParams: config.tokenParams,
    callbackUrl: config.callbackUrl,
    vercelToken: config.vercelToken,
    fetch: config.fetch,
  };

  type Input = InferSchema<SCHEMA>;
  type Output = OUTPUT | ConnectRequiredOutput;

  const spec = {
    ...(config.description !== undefined && {
      description: config.description,
    }),
    ...(config.title !== undefined && { title: config.title }),
    inputSchema: config.inputSchema as FlexibleSchema<Input>,
    ...(config.outputSchema !== undefined && {
      outputSchema: config.outputSchema as FlexibleSchema<Output>,
    }),
    execute: async (
      input: Input,
      options: ToolExecutionOptions<CONTEXT>
    ): Promise<Output> => {
      const subject = await resolveSubject(config, options);
      try {
        return await config.execute(input, {
          ...options,
          connector: config.connector,
          fetch: connectFetch(config.connector, subject, tokenConfig),
          getAccessToken: () =>
            acquireAccessToken(config.connector, subject, tokenConfig),
        });
      } catch (err) {
        if (err instanceof ConsentRequiredError) {
          if (config.onConsentRequired) {
            return config.onConsentRequired(err, options);
          }
          return {
            status: 'connect_required',
            connector: err.connector,
            url: err.url,
            message: `Authorize "${err.connector}" to continue.`,
            ...(err.deviceCode !== undefined && { deviceCode: err.deviceCode }),
            ...(err.expiresAt !== undefined && { expiresAt: err.expiresAt }),
          };
        }
        throw err;
      }
    },
  };

  // `tool()` is an identity helper; its overloads can't resolve against the
  // abstract `SCHEMA`/`OUTPUT` generics, so we route the fully-typed spec
  // through it and restate the concrete tool type on the way out.
  return tool(spec as unknown as Tool<Input, Output, CONTEXT>) as Tool<
    Input,
    Output
  >;
}

/**
 * Ergonomic namespace mirroring the requested `connect.tool({ ... })` /
 * `connect.fetch(...)` call style. These are the same functions as the
 * named `connectTool` / `connectFetch` exports; use whichever import
 * style you prefer.
 */
export const connect = {
  tool: connectTool,
  fetch: connectFetch,
} as const;
