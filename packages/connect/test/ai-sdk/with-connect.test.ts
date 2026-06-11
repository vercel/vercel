import { jsonSchema } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withConnect } from '../../src/ai-sdk/with-connect.js';
import * as authorization from '../../src/authorization.js';
import * as token from '../../src/token.js';
import { UserAuthorizationRequiredError } from '../../src/token.js';

const CONNECTOR = 'oauth/linear';
const SUBJECT = { type: 'user' as const, id: 'user_123' };
const INPUT_SCHEMA = jsonSchema<Record<string, never>>({ type: 'object' });

const EXEC_OPTIONS = { toolCallId: 'call_1', messages: [] };

function callExecute(
  tool: ReturnType<typeof withConnect>,
  input: unknown = {}
): Promise<unknown> {
  if (typeof tool.execute !== 'function') {
    throw new Error('expected the wrapped tool to have an execute function');
  }
  // The runtime execution-options bag is a superset of what `execute` reads.
  return tool.execute(input, EXEC_OPTIONS as never) as Promise<unknown>;
}

describe('withConnect', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves a token and passes it to execute', async () => {
    vi.spyOn(token, 'getToken').mockResolvedValue('access_token_value');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));

    const tool = withConnect(
      { connectorId: CONNECTOR, subject: SUBJECT, scopes: ['read'] },
      {
        description: 'whoami',
        inputSchema: INPUT_SCHEMA,
        execute: async (_input, { token: accessToken }) => {
          await fetch('https://api.linear.app/graphql', {
            method: 'POST',
            headers: { authorization: `Bearer ${accessToken}` },
          });
          return { ok: true };
        },
      }
    );

    const result = await callExecute(tool);

    expect(result).toEqual({ ok: true });
    expect(token.getToken).toHaveBeenCalledWith(
      CONNECTOR,
      expect.objectContaining({ subject: SUBJECT, scopes: ['read'] }),
      undefined
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer access_token_value'
    );
  });

  it('exposes the raw token for vendor SDKs', async () => {
    vi.spyOn(token, 'getToken').mockResolvedValue('raw_token');

    const sdkCall = vi.fn().mockResolvedValue({ ok: true });
    const tool = withConnect(
      { connectorId: CONNECTOR, subject: SUBJECT },
      {
        inputSchema: INPUT_SCHEMA,
        execute: async (_input, { token: accessToken }) => {
          // Vendor SDKs take a bearer string — not every integration is fetch-shaped.
          return sdkCall(accessToken);
        },
      }
    );

    const result = await callExecute(tool);

    expect(result).toEqual({ ok: true });
    expect(sdkCall).toHaveBeenCalledWith('raw_token');
  });

  it('returns a structured authorization-required output instead of throwing', async () => {
    vi.spyOn(token, 'getToken').mockRejectedValue(
      new UserAuthorizationRequiredError('authorization required')
    );
    vi.spyOn(authorization, 'startAuthorization').mockResolvedValue({
      request: 'req_1',
      verifier: 'verifier_1',
      url: 'https://vercel.com/connect/authorize/abc',
    });

    const execute = vi.fn();
    const tool = withConnect(
      { connectorId: CONNECTOR, subject: SUBJECT },
      { inputSchema: INPUT_SCHEMA, execute }
    );

    const result = await callExecute(tool);

    expect(result).toEqual({
      status: 'connect_required',
      connectorId: CONNECTOR,
      url: 'https://vercel.com/connect/authorize/abc',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('rethrows non-authorization errors', async () => {
    vi.spyOn(token, 'getToken').mockRejectedValue(new Error('boom'));

    const tool = withConnect(
      { connectorId: CONNECTOR, subject: SUBJECT },
      {
        inputSchema: INPUT_SCHEMA,
        execute: async () => null,
      }
    );

    await expect(callExecute(tool)).rejects.toThrow('boom');
  });

  it('maps the authorization-required output to a model instruction', async () => {
    const tool = withConnect(
      { connectorId: CONNECTOR, subject: SUBJECT },
      {
        inputSchema: INPUT_SCHEMA,
        execute: async () => null,
      }
    );

    expect(typeof tool.toModelOutput).toBe('function');
    const modelOutput = tool.toModelOutput!({
      toolCallId: 'call_1',
      input: {},
      output: {
        status: 'connect_required',
        connectorId: CONNECTOR,
        url: 'https://vercel.com/connect/authorize/abc',
      },
    });

    expect(modelOutput).toMatchObject({
      type: 'json',
      value: { status: 'connect_required', connectorId: CONNECTOR },
    });
    // The consent URL is not leaked to the model; only the UI renders it.
    expect(JSON.stringify(modelOutput)).not.toContain('authorize/abc');
  });

  it('passes normal output through to the model as JSON', () => {
    const tool = withConnect(
      { connectorId: CONNECTOR, subject: SUBJECT },
      {
        inputSchema: INPUT_SCHEMA,
        execute: async () => ({ id: 'u_1' }),
      }
    );

    const modelOutput = tool.toModelOutput!({
      toolCallId: 'call_1',
      input: {},
      output: { id: 'u_1' },
    });

    expect(modelOutput).toEqual({ type: 'json', value: { id: 'u_1' } });
  });
});
