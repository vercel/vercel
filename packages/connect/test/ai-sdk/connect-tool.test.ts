import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonSchema, type ToolExecutionOptions } from 'ai';
import {
  connect,
  connectFetch,
  connectTool,
  type ConnectRequiredOutput,
} from '../../src/ai-sdk/connect-tool.js';
import * as authorization from '../../src/authorization.js';
import * as token from '../../src/token.js';
import { UserAuthorizationRequiredError } from '../../src/token.js';

const CONNECTOR = 'oauth/linear';
const SUBJECT = { type: 'user' as const, id: 'user_123' };
const EMPTY_SCHEMA = jsonSchema<Record<string, never>>({
  type: 'object',
  properties: {},
  additionalProperties: false,
});

function execOptions(
  context: Record<string, unknown> = {}
): ToolExecutionOptions<Record<string, unknown>> {
  return { toolCallId: 'call_1', messages: [], context };
}

/** Invoke a tool's execute with a definite (non-undefined) handle. */
async function runTool<T>(
  tool: { execute?: (...args: never[]) => unknown },
  input: unknown,
  options: ToolExecutionOptions<Record<string, unknown>>
): Promise<T> {
  if (!tool.execute) throw new Error('tool has no execute');
  return (await (tool.execute as (i: unknown, o: unknown) => unknown)(
    input,
    options
  )) as T;
}

describe('connectFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('injects the Connect access token as a Bearer header', async () => {
    vi.spyOn(token, 'getToken').mockResolvedValue('access_token_value');
    const baseFetch = vi.fn().mockResolvedValue(new Response('ok'));

    const fetchImpl = connectFetch(CONNECTOR, SUBJECT, {
      scopes: ['read'],
      fetch: baseFetch,
    });
    await fetchImpl('https://api.linear.app/graphql', { method: 'POST' });

    expect(token.getToken).toHaveBeenCalledWith(
      CONNECTOR,
      { subject: SUBJECT, scopes: ['read'] },
      undefined
    );
    expect(baseFetch).toHaveBeenCalledTimes(1);
    const [, init] = baseFetch.mock.calls[0];
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer access_token_value'
    );
  });

  it('preserves an explicit Authorization header on the request', async () => {
    vi.spyOn(token, 'getToken').mockResolvedValue('access_token_value');
    const baseFetch = vi.fn().mockResolvedValue(new Response('ok'));

    const fetchImpl = connectFetch(CONNECTOR, SUBJECT, { fetch: baseFetch });
    await fetchImpl('https://api.linear.app/graphql', {
      headers: { authorization: 'Bearer caller_supplied' },
    });

    const [, init] = baseFetch.mock.calls[0];
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer caller_supplied'
    );
  });

  it('resolves a vercelToken thunk and forwards it to getToken', async () => {
    vi.spyOn(token, 'getToken').mockResolvedValue('tok');
    const baseFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const vercelToken = vi.fn().mockResolvedValue('fresh');

    const fetchImpl = connectFetch(CONNECTOR, SUBJECT, {
      fetch: baseFetch,
      vercelToken,
    });
    await fetchImpl('https://api.linear.app');

    expect(vercelToken).toHaveBeenCalledTimes(1);
    expect(token.getToken).toHaveBeenCalledWith(
      CONNECTOR,
      { subject: SUBJECT },
      {
        vercelToken: 'fresh',
      }
    );
  });

  it('throws ConsentRequiredError (with the consent URL) when authorization is required', async () => {
    vi.spyOn(token, 'getToken').mockRejectedValue(
      new UserAuthorizationRequiredError('user must authorize')
    );
    vi.spyOn(authorization, 'startAuthorization').mockResolvedValue({
      request: 'req_abc',
      verifier: 'verifier_xyz',
      url: 'https://connect.vercel.com/consent/oauth/linear?req=abc',
    });
    const baseFetch = vi.fn();

    const fetchImpl = connectFetch(CONNECTOR, SUBJECT, {
      scopes: ['read'],
      callbackUrl: 'https://example.com/callback',
      fetch: baseFetch,
    });

    await expect(fetchImpl('https://api.linear.app')).rejects.toMatchObject({
      name: 'ConsentRequiredError',
      connector: CONNECTOR,
      url: 'https://connect.vercel.com/consent/oauth/linear?req=abc',
    });
    expect(authorization.startAuthorization).toHaveBeenCalledWith(
      CONNECTOR,
      { subject: SUBJECT, scopes: ['read'] },
      { callbackUrl: 'https://example.com/callback' }
    );
    expect(baseFetch).not.toHaveBeenCalled();
  });
});

describe('connectTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the happy path with a token-injecting fetch', async () => {
    vi.spyOn(token, 'getToken').mockResolvedValue('access_token_value');
    const baseFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { viewer: { id: 'u_1' } } }))
      );

    const tool = connectTool({
      connector: CONNECTOR,
      subject: SUBJECT,
      scopes: ['read'],
      description: 'whoami',
      inputSchema: EMPTY_SCHEMA,
      fetch: baseFetch,
      execute: async (_input, { fetch }) => {
        const res = await fetch('https://api.linear.app/graphql', {
          method: 'POST',
        });
        const body = (await res.json()) as { data: { viewer: unknown } };
        return body.data.viewer;
      },
    });

    const result = await runTool(tool, {}, execOptions());
    expect(result).toEqual({ id: 'u_1' });
    const [, init] = baseFetch.mock.calls[0];
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer access_token_value'
    );
  });

  it('returns a connect_required output when the user has no grant', async () => {
    vi.spyOn(token, 'getToken').mockRejectedValue(
      new UserAuthorizationRequiredError('authorize')
    );
    vi.spyOn(authorization, 'startAuthorization').mockResolvedValue({
      request: 'req',
      verifier: 'ver',
      url: 'https://connect.vercel.com/consent',
    });

    const tool = connectTool({
      connector: CONNECTOR,
      subject: SUBJECT,
      inputSchema: EMPTY_SCHEMA,
      execute: async (_input, { fetch }) => {
        const res = await fetch('https://api.linear.app');
        return res.json();
      },
    });

    const result = await runTool<ConnectRequiredOutput>(
      tool,
      {},
      execOptions()
    );
    expect(result).toEqual({
      status: 'connect_required',
      connector: CONNECTOR,
      url: 'https://connect.vercel.com/consent',
      message: 'Authorize "oauth/linear" to continue.',
    });
  });

  it('resolves the subject from the execution context when not configured', async () => {
    vi.spyOn(token, 'getToken').mockResolvedValue('tok');
    const baseFetch = vi.fn().mockResolvedValue(new Response('{}'));

    const tool = connectTool({
      connector: CONNECTOR,
      inputSchema: EMPTY_SCHEMA,
      fetch: baseFetch,
      execute: async (_input, { fetch }) => {
        await fetch('https://api.linear.app');
        return { ok: true };
      },
    });

    await runTool(tool, {}, execOptions({ connectSubject: SUBJECT }));
    expect(token.getToken).toHaveBeenCalledWith(
      CONNECTOR,
      { subject: SUBJECT },
      undefined
    );
  });

  it('throws a clear error when no subject is available', async () => {
    const tool = connectTool({
      connector: CONNECTOR,
      inputSchema: EMPTY_SCHEMA,
      execute: async () => ({ ok: true }),
    });

    await expect(runTool(tool, {}, execOptions())).rejects.toThrow(
      /no token subject available/
    );
  });

  it('lets onConsentRequired override the default output', async () => {
    vi.spyOn(token, 'getToken').mockRejectedValue(
      new UserAuthorizationRequiredError('authorize')
    );
    vi.spyOn(authorization, 'startAuthorization').mockResolvedValue({
      request: 'req',
      verifier: 'ver',
      url: 'https://connect.vercel.com/consent',
    });

    const tool = connectTool({
      connector: CONNECTOR,
      subject: SUBJECT,
      inputSchema: EMPTY_SCHEMA,
      execute: async (_input, { fetch }) => {
        await fetch('https://api.linear.app');
        return { ok: true };
      },
      onConsentRequired: error => ({
        status: 'connect_required' as const,
        connector: error.connector,
        url: error.url,
        message: 'custom message',
      }),
    });

    const result = await runTool<ConnectRequiredOutput>(
      tool,
      {},
      execOptions()
    );
    expect(result.message).toBe('custom message');
  });
});

describe('connect namespace', () => {
  it('exposes tool and fetch as the same functions as the named exports', () => {
    expect(connect.tool).toBe(connectTool);
    expect(connect.fetch).toBe(connectFetch);
  });
});
