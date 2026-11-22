import type { Authenticator } from './authenticator';
import type { TestServer } from './test-server';

// Server-state reads for checking what a CLI write did (front: fetchData).
// Requests go straight to the sandbox with the default token, bypassing the
// CLI and the proxy.

export interface Api {
  <T = unknown>(path: string, init?: RequestInit): Promise<T>;
  raw: (path: string, init?: RequestInit) => Promise<Response>;
}

export function createApi(
  testServer: TestServer,
  authenticator: Authenticator
): Api {
  const raw = async (path: string, init?: RequestInit) => {
    const current = authenticator.current;
    if (!current) {
      throw new Error('call login() or authenticator.withTeam() before api()');
    }
    const url = new URL(path, 'http://placeholder');
    if (!url.searchParams.has('teamId')) {
      url.searchParams.set('teamId', current.team.id);
    }
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${current.token.secretString}`);
    return testServer.fetch(`${url.pathname}${url.search}`, {
      ...init,
      headers,
    });
  };

  const api = async <T = unknown>(path: string, init?: RequestInit) => {
    const response = await raw(path, init);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `api ${init?.method ?? 'GET'} ${path} failed with HTTP ${response.status}: ${body.slice(0, 300)}`
      );
    }
    return (await response.json()) as T;
  };

  return Object.assign(api, { raw }) as Api;
}
