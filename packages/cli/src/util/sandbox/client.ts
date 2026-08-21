import { Sandbox, APIError, Snapshot } from '@vercel/sandbox';
import pkg from '../pkg';
import { formatSandboxError } from './format-error';

const fetchWithUserAgent: typeof globalThis.fetch = (input, init) => {
  const headers = new Headers(init?.headers ?? {});
  let agent = `vercel-cli/${pkg.version}`;
  const existing = headers.get('user-agent');
  if (existing) {
    agent += ` ${existing}`;
  }
  headers.set('user-agent', agent);
  return fetch(input, { ...init, headers });
};

async function withErrorHandling<T>(factory: () => Promise<T>): Promise<T> {
  try {
    return await factory();
  } catch (error) {
    if (error instanceof APIError) {
      const message = await formatSandboxError(error);
      if (message) {
        throw new Error(message);
      }
    }
    throw error;
  }
}

export const sandboxClient: Pick<
  typeof Sandbox,
  'get' | 'list' | 'create' | 'fork'
> = {
  get: params =>
    withErrorHandling(() =>
      Sandbox.get({ fetch: fetchWithUserAgent, resume: false, ...params })
    ),
  create: params =>
    withErrorHandling(() =>
      Sandbox.create({ fetch: fetchWithUserAgent, ...params })
    ),
  fork: params =>
    withErrorHandling(() =>
      Sandbox.fork({ fetch: fetchWithUserAgent, ...params })
    ),
  list: params =>
    withErrorHandling(() =>
      Sandbox.list({ fetch: fetchWithUserAgent, ...params } as typeof params)
    ),
};

export const snapshotClient: Pick<typeof Snapshot, 'get' | 'list' | 'tree'> = {
  list: params =>
    withErrorHandling(() =>
      Snapshot.list({ fetch: fetchWithUserAgent, ...params })
    ),
  get: params => withErrorHandling(() => Snapshot.get({ ...params })),
  tree: params =>
    withErrorHandling(() =>
      Snapshot.tree({ fetch: fetchWithUserAgent, ...params })
    ),
};
