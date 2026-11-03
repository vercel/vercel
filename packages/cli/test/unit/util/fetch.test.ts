import { Readable } from 'node:stream';
import { Agent, MockAgent, type Dispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fetch, {
  directFetch,
  getUploadDispatcher,
  setFetchDispatcher,
  toNodeReadable,
} from '../../../src/util/fetch';
import {
  EnvProxyDispatcher,
  type EnvProxyDispatcherOptions,
} from '../../../src/util/fetch-proxy';

const PROXY_ENV_NAMES = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
] as const;

type ProxyDispatcher = NonNullable<EnvProxyDispatcherOptions['directAgent']>;

describe('native fetch', () => {
  let originalProxyEnv: Record<string, string | undefined>;
  let destroyDispatcher: (() => Promise<void>) | undefined;

  beforeEach(() => {
    originalProxyEnv = Object.fromEntries(
      PROXY_ENV_NAMES.map(name => [name, process.env[name]])
    );
    for (const name of PROXY_ENV_NAMES) {
      delete process.env[name];
    }
    setFetchDispatcher(undefined);
  });

  afterEach(async () => {
    setFetchDispatcher(undefined);
    await destroyDispatcher?.();
    destroyDispatcher = undefined;
    vi.restoreAllMocks();

    for (const name of PROXY_ENV_NAMES) {
      const value = originalProxyEnv[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it('supports Node request and response streams', async () => {
    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    mockAgent
      .get('http://example.test')
      .intercept({ path: '/', method: 'POST', body: () => true })
      .reply(200, 'native fetch');
    setFetchDispatcher(mockAgent);
    destroyDispatcher = () => mockAgent.close();

    const response = await fetch('http://example.test/', {
      method: 'POST',
      body: Readable.from(['native fetch']),
    });
    let responseBody = '';
    for await (const chunk of toNodeReadable(response.body)) {
      responseBody += Buffer.from(chunk).toString();
    }

    expect(responseBody).toBe('native fetch');
  });

  it('does not apply a configured dispatcher to direct requests', async () => {
    const proxyDispatcher = trackedDispatcher('proxy', []);
    setFetchDispatcher(proxyDispatcher);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('direct'));

    await directFetch('http://127.0.0.1:3000/', {
      dispatcher: proxyDispatcher,
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][1]).not.toHaveProperty('dispatcher');
  });

  it('selects the configured proxy dispatcher', async () => {
    const calls: string[] = [];
    const directAgent = trackedDispatcher('direct', calls);
    const proxyAgent = trackedDispatcher('proxy', calls);
    process.env.HTTP_PROXY = 'http://proxy.test:8080';

    const dispatcher = new EnvProxyDispatcher({
      directAgent,
      createProxyAgent: url => {
        expect(url).toBe('http://proxy.test:8080');
        return proxyAgent;
      },
    });
    destroyDispatcher = () => dispatcher.destroy();

    dispatcher.dispatch(dispatchOptions('http://example.test'), handlers());
    expect(calls).toEqual(['proxy']);
  });

  it('selects protocol-specific proxy dispatchers', async () => {
    const calls: string[] = [];
    const directAgent = trackedDispatcher('direct', calls);
    process.env.HTTP_PROXY = 'http://http-proxy.test:8080';
    process.env.HTTPS_PROXY = 'http://https-proxy.test:8443';

    const dispatcher = new EnvProxyDispatcher({
      directAgent,
      createProxyAgent: url => trackedDispatcher(url, calls),
    });
    destroyDispatcher = () => dispatcher.destroy();

    dispatcher.dispatch(dispatchOptions('http://example.test'), handlers());
    dispatcher.dispatch(dispatchOptions('https://example.test'), handlers());
    expect(calls).toEqual([
      'http://http-proxy.test:8080',
      'http://https-proxy.test:8443',
    ]);
  });

  it('uses HTTP_PROXY for HTTPS when HTTPS_PROXY is not set', async () => {
    const calls: string[] = [];
    const directAgent = trackedDispatcher('direct', calls);
    const proxyAgent = trackedDispatcher('proxy', calls);
    process.env.HTTP_PROXY = 'http://proxy.test:8080';

    const dispatcher = new EnvProxyDispatcher({
      directAgent,
      createProxyAgent: url => {
        expect(url).toBe('http://proxy.test:8080');
        return proxyAgent;
      },
    });
    destroyDispatcher = () => dispatcher.destroy();

    dispatcher.dispatch(dispatchOptions('https://example.test'), handlers());
    expect(calls).toEqual(['proxy']);
  });

  it('selects the direct dispatcher for NO_PROXY matches', async () => {
    const calls: string[] = [];
    const directAgent = trackedDispatcher('direct', calls);
    const proxyAgent = trackedDispatcher('proxy', calls);
    process.env.HTTP_PROXY = 'http://proxy.test:8080';
    process.env.NO_PROXY = 'example.test';

    const dispatcher = new EnvProxyDispatcher({
      directAgent,
      createProxyAgent: () => proxyAgent,
    });
    destroyDispatcher = () => dispatcher.destroy();

    dispatcher.dispatch(dispatchOptions('http://example.test'), handlers());
    expect(calls).toEqual(['direct']);
  });

  it('honors NO_PROXY ports', async () => {
    const calls: string[] = [];
    const directAgent = trackedDispatcher('direct', calls);
    const proxyAgent = trackedDispatcher('proxy', calls);
    process.env.HTTP_PROXY = 'http://proxy.test:8080';
    process.env.NO_PROXY = 'example.test:8080';

    const dispatcher = new EnvProxyDispatcher({
      directAgent,
      createProxyAgent: () => proxyAgent,
    });
    destroyDispatcher = () => dispatcher.destroy();

    dispatcher.dispatch(
      dispatchOptions('http://example.test:8080'),
      handlers()
    );
    dispatcher.dispatch(
      dispatchOptions('http://example.test:8081'),
      handlers()
    );
    expect(calls).toEqual(['direct', 'proxy']);
  });
});

describe('getUploadDispatcher', () => {
  const originalValue = process.env.VERCEL_EXPERIMENTAL_HTTP2_UPLOADS;

  afterEach(() => {
    setFetchDispatcher(undefined);
    if (originalValue === undefined) {
      delete process.env.VERCEL_EXPERIMENTAL_HTTP2_UPLOADS;
    } else {
      process.env.VERCEL_EXPERIMENTAL_HTTP2_UPLOADS = originalValue;
    }
  });

  it('uses the default dispatcher when the flag is not set', async () => {
    delete process.env.VERCEL_EXPERIMENTAL_HTTP2_UPLOADS;

    await expect(getUploadDispatcher()).resolves.toBeUndefined();
  });

  it.each([
    '1',
    'true',
    'TRUE',
  ])('uses one shared HTTP/2 agent when the flag is "%s"', async value => {
    process.env.VERCEL_EXPERIMENTAL_HTTP2_UPLOADS = value;

    const dispatcher = await getUploadDispatcher();

    expect(dispatcher).toBeInstanceOf(Agent);
    await expect(getUploadDispatcher()).resolves.toBe(dispatcher);
  });

  it('keeps the proxy dispatcher when a proxy is configured', async () => {
    process.env.VERCEL_EXPERIMENTAL_HTTP2_UPLOADS = '1';
    const proxy = trackedDispatcher('proxy', []);
    setFetchDispatcher(proxy);

    await expect(getUploadDispatcher()).resolves.toBe(proxy);
  });
});

function trackedDispatcher(name: string, calls: string[]): ProxyDispatcher {
  return {
    dispatch: () => {
      calls.push(name);
      return true;
    },
    close: async () => {},
    destroy: async () => {},
  } as unknown as ProxyDispatcher;
}

function dispatchOptions(origin: string): Dispatcher.DispatchOptions {
  return { origin, path: '/', method: 'GET' };
}

function handlers(): Dispatcher.DispatchHandlers {
  return {
    onError(error) {
      throw error;
    },
  };
}
