import {
  tool,
  type FlexibleSchema,
  type JSONValue,
  type ModelMessage,
  type Tool,
} from 'ai';
import {
  startAuthorization,
  type ConnectAuthorizationOptions,
} from '../authorization.js';
import {
  getToken,
  UserAuthorizationRequiredError,
  type ConnectTokenParams,
  type ConnectTokenSubject,
} from '../token.js';
import type { ConnectAuthorizationDetail } from '../authorization-details.js';

/**
 * Connect configuration for {@link withConnect}. Mirrors the
 * {@link ConnectTokenParams} request fields, plus the
 * {@link ConnectAuthorizationOptions} used when the user has not yet
 * granted access and a consent URL must be minted.
 */
export interface WithConnectConfig {
  /**
   * Vercel Connect connector UID (e.g. `oauth/linear`) or opaque
   * connector id. The connector defines which provider and OAuth
   * client the tool authenticates against.
   */
  readonly connectorId: string;

  /**
   * Identity the token is issued for. The three subject types
   * (`'app'` / `'user'` / `'jwt-bearer'`) have distinct security
   * semantics — see {@link ConnectTokenSubject}.
   */
  readonly subject: ConnectTokenSubject;

  readonly scopes?: string[];
  readonly installationId?: string;
  readonly audience?: string[];
  readonly resources?: string[];
  readonly authorizationDetails?: ConnectAuthorizationDetail[];
  readonly validityBufferMs?: number;

  /**
   * Override the Vercel OIDC token used to authenticate against the
   * Connect API. Defaults to the `@vercel/oidc` resolver used by the
   * rest of `@vercel/connect`. Useful for tests and non-Vercel
   * runtimes.
   */
  readonly vercelToken?: string;

  /**
   * Where to send the user after they finish granting access on
   * Connect's hosted consent page. Forwarded to Connect's
   * `startAuthorization`. Defaults to the connector's server-side
   * registered redirect.
   */
  readonly callbackUrl?: string;

  /** HTTPS webhook to notify when authorization completes. */
  readonly webhook?: string;

  /**
   * Request the device-authorization flow when minting a consent
   * challenge. Defaults to `false`.
   */
  readonly deviceCode?: boolean;
}

/**
 * Execution options handed to a {@link withConnect} tool's `execute`.
 * A superset of the AI SDK's tool execution options that adds the
 * resolved Connect access {@link ConnectToolExecutionOptions.token} so
 * the tool body never touches `getToken` / `startAuthorization`.
 */
export interface ConnectToolExecutionOptions {
  /** The ID of the tool call. */
  readonly toolCallId: string;
  /** Messages sent to the model to initiate the response. */
  readonly messages: ModelMessage[];
  /** Aborts the overall operation when triggered. */
  readonly abortSignal?: AbortSignal;
  /**
   * The connector access token. Attach as `Authorization: Bearer <token>`
   * for HTTP calls, or pass to a vendor SDK (`new WebClient(token)`).
   */
  readonly token: string;
}

/**
 * Definition of the tool being wrapped. The same shape you would pass
 * to the AI SDK's `tool()`, except `execute` receives
 * {@link ConnectToolExecutionOptions} with the resolved `token`.
 */
export interface ConnectToolDefinition<INPUT, OUTPUT> {
  /** Description the model uses to decide whether to call the tool. */
  readonly description?: string;
  /** Schema of the input the tool expects. */
  readonly inputSchema: FlexibleSchema<INPUT>;
  /**
   * Runs the tool with Connect authorization already resolved. If the
   * user has not granted access, `execute` is skipped and the tool
   * resolves to a {@link ConnectAuthorizationRequired} output instead.
   */
  readonly execute: (
    input: INPUT,
    options: ConnectToolExecutionOptions
  ) => OUTPUT | PromiseLike<OUTPUT>;
}

/**
 * Tool output emitted when the configured subject has not authorized
 * the connector. The UI can render `url` as a "Connect <provider>"
 * button; the model is told (via `toModelOutput`) to stop and ask the
 * user to authorize rather than retry.
 */
export interface ConnectAuthorizationRequired {
  readonly status: 'connect_required';
  /** Connector that needs authorization. */
  readonly connectorId: string;
  /** Consent URL to send the user to. */
  readonly url: string;
}

const AUTHORIZATION_MODEL_INSTRUCTION =
  'The user has not authorized this connector. Stop and ask the user to ' +
  'open the authorization link to grant access. Do not retry the tool ' +
  'until they confirm they have authorized it.';

function isConnectAuthorizationRequired(
  value: unknown
): value is ConnectAuthorizationRequired {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { status?: unknown }).status === 'connect_required'
  );
}

function toTokenParams(config: WithConnectConfig): ConnectTokenParams {
  return {
    subject: config.subject,
    ...(config.scopes !== undefined && { scopes: config.scopes }),
    ...(config.installationId !== undefined && {
      installationId: config.installationId,
    }),
    ...(config.audience !== undefined && { audience: config.audience }),
    ...(config.resources !== undefined && { resources: config.resources }),
    ...(config.authorizationDetails !== undefined && {
      authorizationDetails: config.authorizationDetails,
    }),
    ...(config.validityBufferMs !== undefined && {
      validityBufferMs: config.validityBufferMs,
    }),
  };
}

async function startAuthorizationChallenge(
  config: WithConnectConfig,
  params: ConnectTokenParams
): Promise<ConnectAuthorizationRequired> {
  const options: ConnectAuthorizationOptions = {
    ...(config.vercelToken !== undefined && {
      vercelToken: config.vercelToken,
    }),
    ...(config.callbackUrl !== undefined && {
      callbackUrl: config.callbackUrl,
    }),
    ...(config.webhook !== undefined && { webhook: config.webhook }),
    ...(config.deviceCode !== undefined && { deviceCode: config.deviceCode }),
  };
  const { url } = await startAuthorization(config.connectorId, params, options);
  return { status: 'connect_required', connectorId: config.connectorId, url };
}

/**
 * Wraps an AI SDK tool definition so its `execute` runs with Connect
 * authorization already resolved.
 *
 * Connect owns the OAuth lifecycle: `withConnect` resolves an access
 * token via {@link getToken} before each call and passes it to
 * `execute` as {@link ConnectToolExecutionOptions.token}. Attach it as
 * `Authorization: Bearer <token>` for HTTP calls, or pass it to a
 * vendor SDK. When the configured subject has not yet granted access,
 * the tool resolves to a structured {@link ConnectAuthorizationRequired}
 * output instead of throwing — so the model stream is never
 * interrupted. Configuration errors (e.g. the connector is not
 * installed) still surface as thrown errors.
 *
 * ```ts
 * import { withConnect } from '@vercel/connect/ai-sdk';
 * import { streamText, stepCountIs } from 'ai';
 * import { z } from 'zod';
 *
 * const subject = { type: 'user', id: userId } as const;
 *
 * const linearWhoami = withConnect(
 *   { connectorId: 'oauth/linear', scopes: ['read'], subject },
 *   {
 *     description: 'Return the authenticated Linear user.',
 *     inputSchema: z.object({}),
 *     execute: async (_input, { token }) => {
 *       const res = await fetch('https://api.linear.app/graphql', {
 *         method: 'POST',
 *         headers: {
 *           authorization: `Bearer ${token}`,
 *           'content-type': 'application/json',
 *         },
 *         body: JSON.stringify({ query: '{ viewer { id name email } }' }),
 *       });
 *       return (await res.json()).data.viewer;
 *     },
 *   }
 * );
 *
 * const slackPost = withConnect(
 *   { connectorId: 'oauth/slack', scopes: ['chat:write'], subject },
 *   {
 *     description: 'Post a Slack message.',
 *     inputSchema: z.object({ channel: z.string(), text: z.string() }),
 *     execute: async ({ channel, text }, { token }) => {
 *       const client = new WebClient(token);
 *       return client.chat.postMessage({ channel, text });
 *     },
 *   }
 * );
 *
 * const result = streamText({
 *   model: 'openai/gpt-5.4',
 *   tools: { linear_whoami: linearWhoami, slack_post: slackPost },
 *   stopWhen: stepCountIs(8),
 *   prompt,
 * });
 * ```
 */
export function withConnect<INPUT, OUTPUT>(
  config: WithConnectConfig,
  definition: ConnectToolDefinition<INPUT, OUTPUT>
): Tool<INPUT, OUTPUT | ConnectAuthorizationRequired> {
  const params = toTokenParams(config);
  const connectOptions =
    config.vercelToken !== undefined
      ? { vercelToken: config.vercelToken }
      : undefined;

  const execute = async (
    input: INPUT,
    options: {
      toolCallId: string;
      messages: ModelMessage[];
      abortSignal?: AbortSignal;
    }
  ): Promise<OUTPUT | ConnectAuthorizationRequired> => {
    let token: string;
    try {
      token = await getToken(config.connectorId, params, connectOptions);
    } catch (err) {
      if (err instanceof UserAuthorizationRequiredError) {
        return startAuthorizationChallenge(config, params);
      }
      throw err;
    }

    return definition.execute(input, {
      toolCallId: options.toolCallId,
      messages: options.messages,
      ...(options.abortSignal !== undefined && {
        abortSignal: options.abortSignal,
      }),
      token,
    });
  };

  const toModelOutput = (output: OUTPUT | ConnectAuthorizationRequired) => {
    if (isConnectAuthorizationRequired(output)) {
      return {
        type: 'json' as const,
        value: {
          status: output.status,
          connectorId: output.connectorId,
          instruction: AUTHORIZATION_MODEL_INSTRUCTION,
        },
      };
    }
    return typeof output === 'string'
      ? { type: 'text' as const, value: output }
      : { type: 'json' as const, value: (output ?? null) as JSONValue };
  };

  // When `OUTPUT` is a free generic, the SDK's `ToolOutputProperties`
  // resolves to a deferred conditional type that an object literal can't
  // be checked against. Build against a concrete (`unknown`) tool shape —
  // which resolves the conditional — then downcast to the precise public
  // type. `Tool<unknown, unknown>` is assignable to `Tool<INPUT, …>`
  // (input is contravariant), so this is a safe widening-then-narrowing,
  // not an `as unknown as` escape hatch. `tool()` is an identity helper
  // at runtime; we route the concrete value through it for the blessed
  // public surface.
  const built = tool({
    ...(definition.description !== undefined && {
      description: definition.description,
    }),
    inputSchema: definition.inputSchema as FlexibleSchema<unknown>,
    execute: execute as (
      input: unknown,
      options: {
        toolCallId: string;
        messages: ModelMessage[];
        abortSignal?: AbortSignal;
      }
    ) => Promise<unknown>,
    toModelOutput: ({ output }: { output: unknown }) =>
      toModelOutput(output as OUTPUT | ConnectAuthorizationRequired),
  });

  return built as Tool<INPUT, OUTPUT | ConnectAuthorizationRequired>;
}
