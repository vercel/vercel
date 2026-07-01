import { createHash } from 'crypto';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { OpenApiCache } from '../../../../src/util/openapi/openapi-cache';
import { readSpecResponse } from '../../../../src/util/openapi/read-spec-response';
import { fetchSpecUrl } from '../../../../src/util/openapi/spec-url';
import {
  MAX_OPENAPI_SPEC_BYTES,
  SSO_API_URL,
} from '../../../../src/util/openapi/constants';
import type { OpenApiSpec } from '../../../../src/util/openapi/types';
import { client } from '../../../mocks/client';

const customSpec: OpenApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Custom API', version: '1.0.0' },
  paths: {
    '/v1/internal/widgets': {
      post: {
        operationId: 'createWidget',
        summary: 'Create a widget',
        tags: ['internal'],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Payload' },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Payload: {
        type: 'object',
        properties: { field: { type: 'string' } },
        required: ['field'],
      },
    },
  },
};

describe('OpenApiCache with a custom spec URL', () => {
  it('uses only the custom spec, not the public spec', async () => {
    const fetchSpec = vi.fn().mockResolvedValue(customSpec);
    const cache = new OpenApiCache({
      specUrl: 'https://openapi-internal.vercel.sh/',
      fetchSpecUrl: fetchSpec,
    });

    await expect(cache.load()).resolves.toBe(true);

    const endpoints = cache.getEndpoints();
    expect(endpoints.map(e => e.operationId)).toEqual(['createWidget']);
    expect(
      endpoints.find(e => e.operationId === 'getProjects')
    ).toBeUndefined();
    expect(fetchSpec).toHaveBeenCalledWith(
      'https://openapi-internal.vercel.sh/'
    );
  });

  it('fetches the custom spec fresh on every load', async () => {
    const fetchSpec = vi.fn().mockResolvedValue(customSpec);
    const cache = new OpenApiCache({
      specUrl: 'https://openapi-internal.vercel.sh/',
      fetchSpecUrl: fetchSpec,
    });

    await cache.load();
    await cache.load();

    expect(fetchSpec).toHaveBeenCalledTimes(2);
  });

  it('rejects custom URLs that do not return an OpenAPI document', async () => {
    const cache = new OpenApiCache({
      specUrl: 'https://api.vercel.tools/manifest.json',
      fetchSpecUrl: vi.fn().mockResolvedValue({
        generatedAt: '2026-06-10T17:01:31.100Z',
        services: [],
      }),
    });

    await expect(cache.load()).resolves.toBe(false);
    expect(cache.loadError).toBe(
      'Invalid OpenAPI spec from https://api.vercel.tools/manifest.json: expected an OpenAPI 3.x document with an "openapi" field.'
    );
  });

  it('rejects custom spec URLs outside allowed Vercel-owned hosts', async () => {
    const fetchSpec = vi.fn().mockResolvedValue(customSpec);
    const cache = new OpenApiCache({
      specUrl: 'https://example.com/openapi.json',
      fetchSpecUrl: fetchSpec,
    });

    await expect(cache.load()).resolves.toBe(false);
    expect(cache.loadError).toBe(
      'OpenAPI spec URL must be on an allowed origin.'
    );
    expect(fetchSpec).not.toHaveBeenCalled();
  });

  it('resolves custom spec $refs against the custom spec', async () => {
    const cache = new OpenApiCache({
      specUrl: 'https://openapi-internal.vercel.sh/',
      fetchSpecUrl: vi.fn().mockResolvedValue(customSpec),
    });

    await cache.load();
    const widget = cache.getEndpoints()[0];

    const fields = cache.getBodyFields(widget);
    expect(fields.map(f => f.name)).toEqual(['field']);
    expect(fields[0].required).toBe(true);
  });

  it.each([
    'https://attacker.test/collect',
    '//attacker.test/collect',
    'v1/missing-leading-slash',
  ])('rejects non-relative spec path %s', async path => {
    const cache = new OpenApiCache({
      specUrl: 'https://openapi-internal.vercel.sh/',
      fetchSpecUrl: vi.fn().mockResolvedValue({
        ...customSpec,
        paths: {
          [path]: {
            get: {
              operationId: 'unsafePath',
              tags: ['unsafe'],
            },
          },
        },
      }),
    });

    await expect(cache.load()).resolves.toBe(false);
    expect(cache.loadError).toBe(
      `Invalid OpenAPI spec from https://openapi-internal.vercel.sh/: path "${path}" must be a relative API path.`
    );
  });
});

describe('fetchSpecUrl (Vercel SSO handshake)', () => {
  const SPEC_URL = 'https://openapi-internal.vercel.sh/';
  const NONCE = 'test-nonce';
  const HASHED_NONCE = createHash('sha256').update(NONCE).digest('hex');
  const JWT = 'test-jwt';
  const CALLBACK_URL = `${SPEC_URL}?_vercel_jwt=${JWT}`;

  let fetchMock: ReturnType<typeof vi.fn>;

  function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  function protectionResponse(): Response {
    return new Response('', {
      status: 401,
      headers: {
        'set-cookie': `_vercel_sso_nonce=${NONCE}; Max-Age=3600; Path=/; HttpOnly`,
      },
    });
  }

  function redirectResponse(location: string): Response {
    return new Response('', { status: 302, headers: { location } });
  }

  beforeEach(() => {
    client.reset();
    client.authConfig.token = 'user-token';
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a public custom spec directly', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(customSpec));

    const spec = await fetchSpecUrl(client, SPEC_URL);
    expect(spec).toEqual(customSpec);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('completes the deployment-protection SSO handshake', async () => {
    const sessionJwt = 'session-jwt';
    const callbackRedirect = new Response('', {
      status: 302,
      headers: {
        location: SPEC_URL,
        'set-cookie': `_vercel_jwt=${sessionJwt}; Path=/; HttpOnly`,
      },
    });

    fetchMock
      .mockResolvedValueOnce(protectionResponse())
      .mockResolvedValueOnce(redirectResponse(CALLBACK_URL))
      .mockResolvedValueOnce(callbackRedirect)
      .mockResolvedValueOnce(jsonResponse(customSpec));

    const spec = await fetchSpecUrl(client, SPEC_URL);
    expect(spec).toEqual(customSpec);

    const [ssoUrl, ssoInit] = fetchMock.mock.calls[1];
    expect(ssoUrl).toBe(
      `${SSO_API_URL}?url=${encodeURIComponent(SPEC_URL)}&nonce=${HASHED_NONCE}`
    );
    expect(ssoInit.headers.cookie).toBe(
      `authorization=${encodeURIComponent('Bearer user-token')}; isLoggedIn=1`
    );

    const [callbackUrl, callbackInit] = fetchMock.mock.calls[2];
    expect(callbackUrl).toBe(CALLBACK_URL);
    expect(callbackInit.headers.cookie).toBe(`_vercel_sso_nonce=${NONCE}`);

    const [finalUrl, finalInit] = fetchMock.mock.calls[3];
    expect(finalUrl).toBe(SPEC_URL);
    expect(finalInit.headers.cookie).toBe(
      `_vercel_sso_nonce=${NONCE}; _vercel_jwt=${sessionJwt}`
    );
  });

  it('returns null when the user has no access', async () => {
    fetchMock
      .mockResolvedValueOnce(protectionResponse())
      .mockResolvedValueOnce(redirectResponse('https://vercel.com/login'));

    await expect(fetchSpecUrl(client, SPEC_URL)).rejects.toThrow(
      `Could not load OpenAPI spec from ${SPEC_URL}: HTTP 302.`
    );
  });

  it('shows the HTTP status when the spec URL cannot be loaded', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 403 }));

    await expect(fetchSpecUrl(client, SPEC_URL)).rejects.toThrow(
      `Could not load OpenAPI spec from ${SPEC_URL}: HTTP 403.`
    );
  });

  it('rejects cross-origin SSO callback redirects before sending cookies', async () => {
    fetchMock
      .mockResolvedValueOnce(protectionResponse())
      .mockResolvedValueOnce(
        redirectResponse('https://attacker.vercel.sh/?_vercel_jwt=test-jwt')
      );

    await expect(fetchSpecUrl(client, SPEC_URL)).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls).not.toEqual(
      expect.arrayContaining([
        expect.arrayContaining([expect.stringContaining('attacker.vercel.sh')]),
      ])
    );
  });

  it('rejects cross-origin redirects after receiving the deployment protection JWT', async () => {
    const sessionJwt = 'session-jwt';
    const callbackRedirect = new Response('', {
      status: 302,
      headers: {
        location: 'https://attacker.vercel.sh/openapi.json',
        'set-cookie': `_vercel_jwt=${sessionJwt}; Path=/; HttpOnly`,
      },
    });

    fetchMock
      .mockResolvedValueOnce(protectionResponse())
      .mockResolvedValueOnce(redirectResponse(CALLBACK_URL))
      .mockResolvedValueOnce(callbackRedirect);

    await expect(fetchSpecUrl(client, SPEC_URL)).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls).not.toEqual(
      expect.arrayContaining([
        expect.arrayContaining([expect.stringContaining('attacker.vercel.sh')]),
      ])
    );
  });

  it('returns null when a protected spec is requested without credentials', async () => {
    client.authConfig.token = undefined;
    fetchMock.mockResolvedValueOnce(protectionResponse());

    await expect(fetchSpecUrl(client, SPEC_URL)).resolves.toBeNull();
  });

  it('rejects non-https spec URLs', async () => {
    await expect(fetchSpecUrl(client, 'file:///tmp/spec.json')).rejects.toThrow(
      'OpenAPI spec URL must use https'
    );
  });

  it('rejects hostnames that only share the allowed suffix text', async () => {
    await expect(
      fetchSpecUrl(client, 'https://attacker-vercel.sh/openapi.json')
    ).rejects.toThrow('OpenAPI spec URL must be on an allowed origin.');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized direct spec responses by content-length', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', {
        status: 200,
        headers: { 'content-length': String(MAX_OPENAPI_SPEC_BYTES + 1) },
      })
    );

    await expect(fetchSpecUrl(client, SPEC_URL)).rejects.toThrow(
      `OpenAPI spec from ${SPEC_URL} exceeds the ${MAX_OPENAPI_SPEC_BYTES} byte limit.`
    );
  });

  it('rejects oversized SSO-protected spec responses by content-length', async () => {
    const sessionJwt = 'session-jwt';
    const callbackRedirect = new Response('', {
      status: 302,
      headers: {
        location: SPEC_URL,
        'set-cookie': `_vercel_jwt=${sessionJwt}; Path=/; HttpOnly`,
      },
    });

    fetchMock
      .mockResolvedValueOnce(protectionResponse())
      .mockResolvedValueOnce(redirectResponse(CALLBACK_URL))
      .mockResolvedValueOnce(callbackRedirect)
      .mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: { 'content-length': String(MAX_OPENAPI_SPEC_BYTES + 1) },
        })
      );

    await expect(fetchSpecUrl(client, SPEC_URL)).rejects.toThrow(
      `OpenAPI spec from ${SPEC_URL} exceeds the ${MAX_OPENAPI_SPEC_BYTES} byte limit.`
    );
  });

  it('redacts JWT query values from SSO-protected spec errors', async () => {
    fetchMock
      .mockResolvedValueOnce(protectionResponse())
      .mockResolvedValueOnce(redirectResponse(CALLBACK_URL))
      .mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: { 'content-length': String(MAX_OPENAPI_SPEC_BYTES + 1) },
        })
      );

    await expect(fetchSpecUrl(client, SPEC_URL)).rejects.toThrow(
      'OpenAPI spec from https://openapi-internal.vercel.sh/?_vercel_jwt=%5Bredacted%5D exceeds the 52428800 byte limit.'
    );
  });
});

describe('readSpecResponse', () => {
  it('rejects responses that exceed the byte limit while streaming', async () => {
    const response = new Response('12345678901');

    await expect(
      readSpecResponse(response, 'https://api.vercel.tools/openapi.json', 10)
    ).rejects.toThrow(
      'OpenAPI spec from https://api.vercel.tools/openapi.json exceeds the 10 byte limit.'
    );
  });
});
