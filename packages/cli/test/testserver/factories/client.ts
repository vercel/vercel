// Vendored from vercel/front packages/testing-factories/src/client.ts at
// 185cfac41a9, which was itself imported from vercel/api
// packages/testing-factories. Keep in sync by hand.
//
// Local adaptations:
// - Formatted with this repo's Prettier settings.
// - `createFactories` takes an optional `signal` getter, applied to every
//   `build` request (used by the fixture's per-call timeout).
import type { Factories } from './types';

type ClientFactories = {
  [key: string]: Factories;
} & ClientFactoryBuild;

interface ClientFactoryBuild {
  build: <TData = Record<string, unknown>, TOptions = Record<string, unknown>>(
    data?: Partial<TData>,
    options?: Partial<TOptions>
  ) => Promise<TData>;
}

export function createFactories({
  testserverBase,
  testId,
  onFactory,
  signal,
}: {
  testserverBase: string;
  testId: string;
  onFactory?: (f: {
    path: string;
    data: unknown;
    options: unknown;
    response: unknown;
  }) => void;
  signal?: () => AbortSignal | undefined;
}): Factories {
  const pathMap = new WeakMap<object, string>();
  const externalMap = new Map<string, ClientFactories>();

  const createHandler = (
    parentPath: string,
    path: string
  ): ProxyHandler<object> => {
    return {
      get(_, prop: string | symbol) {
        if (typeof prop === 'symbol') return undefined;
        if (prop === 'external') {
          return externalFactories;
        }
        if (prop === 'build') {
          return async (data?: unknown, options?: unknown) => {
            const response = await fetch(
              `${testserverBase}${parentPath}${path}`,
              {
                method: 'POST',
                headers: {
                  'test-id': testId,
                  'content-type': 'application/json',
                },
                body: JSON.stringify([data ?? {}, options ?? {}]),
                signal: signal?.(),
              }
            );
            if (!response.ok) {
              throw new Error(
                `Failed to create factory (${path}): ${response.status} ${response.statusText} - ${await response.text()}`
              );
            }
            const factoryData = (await response.json()) as unknown;
            if (onFactory) {
              onFactory({
                path: `${parentPath}${path}`,
                data,
                options,
                response: factoryData,
              });
            }
            return factoryData;
          };
        }
        const nextPath = path ? `${path}/${prop}` : `/${prop}`;
        const nextTarget = {};
        const nextProxy = new Proxy(
          nextTarget,
          createHandler(parentPath, nextPath)
        );
        pathMap.set(nextTarget, nextPath);
        return nextProxy;
      },
    };
  };

  const externalFactories = (path: string): ClientFactories => {
    let factories = externalMap.get(path);
    if (!factories) {
      factories = new Proxy(
        {},
        createHandler(`/_/external/${path}/_/factories`, '')
      ) as ClientFactories;
      externalMap.set(path, factories);
    }
    return factories;
  };

  return new Proxy({}, createHandler('/_/factories', '')) as Factories;
}
