import { Readable } from 'node:stream';
import { MockAgent, type Dispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fetch, {
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
