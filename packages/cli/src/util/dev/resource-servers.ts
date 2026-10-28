import type http from 'http';
import { listen } from 'async-listen';
import { isErrnoException } from '@vercel/error-utils';

export const DEV_QUEUE_API_PREFIX = '/api/v3/topic/';
export const DEV_QUEUE_PROXY_PREFIX = '/_svc/_queues';
export const DEV_QUEUE_DEFAULT_PORT = 4782;
export const DEV_RUNTIME_CACHE_DEFAULT_PORT = 4783;
export const DEV_SCHEDULES_DEFAULT_PORT = 4784;
export const DEV_SCHEDULES_PROXY_PREFIX = '/_svc/_schedules';
export const DEV_RESOURCE_TOKEN = 'vc-dev-token';

export interface DevResourceEndpoints {
  queues: {
    direct: string;
    proxy: string;
  };
  runtimeCache: {
    direct: string;
    proxy: string;
  };
  schedules?: {
    direct: string;
    proxy: string;
  };
}

export interface DevResourceListenResult {
  origin: string;
  port: number;
  defaultPort?: number;
}

export function isValidDevResourceHost(
  origin: string,
  host: string | undefined
): boolean {
  const port = new URL(origin).port;
  const suffix = port ? `:${port}` : '';
  const normalizedHost = host?.toLowerCase();
  return (
    normalizedHost === `127.0.0.1${suffix}` ||
    normalizedHost === `localhost${suffix}`
  );
}

export async function listenOnDevResourcePort(
  server: http.Server,
  options: {
    name: string;
    flag: string;
    defaultPort: number;
    port?: number;
    reservedPorts?: readonly number[];
  }
): Promise<DevResourceListenResult> {
  const isPinned = options.port !== undefined;
  const reservedPorts = new Set(options.reservedPorts);
  let port = options.port ?? options.defaultPort;

  while (true) {
    if (!isPinned && reservedPorts.has(port)) {
      if (port >= 65535) {
        throw new Error(
          `${options.name} could not find an available port at or above 127.0.0.1:${options.defaultPort}. Choose another port with ${options.flag}.`
        );
      }
      port++;
      continue;
    }

    try {
      const address = await listen(server, port, '127.0.0.1');
      const url = new URL(address.toString());
      const serverAddress = server.address();
      const actualPort =
        serverAddress && typeof serverAddress !== 'string'
          ? serverAddress.port
          : Number(url.port);
      return {
        origin: url.origin,
        port: actualPort,
        ...(port !== options.defaultPort && !isPinned
          ? { defaultPort: options.defaultPort }
          : {}),
      };
    } catch (err) {
      if (!isErrnoException(err) || err.code !== 'EADDRINUSE') {
        throw err;
      }
      if (isPinned || port >= 65535) {
        throw new Error(
          `${options.name} could not listen on 127.0.0.1:${port} because the port is already in use. Choose another port with ${options.flag}.`
        );
      }
      port++;
    }
  }
}

export function getDevQueueEnv(
  baseUrl: string,
  hasWorkerServices = true
): Record<string, string> {
  return {
    ...(hasWorkerServices ? { VERCEL_HAS_WORKER_SERVICES: '1' } : {}),
    VERCEL_QUEUE_BASE_URL: baseUrl,
    VERCEL_QUEUE_TOKEN: DEV_RESOURCE_TOKEN,
    VERCEL_REGION: 'dev1',
  };
}

export function getDevSchedulesEnv(
  baseUrl: string | undefined,
  container = false
): Record<string, string> {
  if (!baseUrl) return {};
  const endpoint = new URL(baseUrl);
  // The container builder rewrites Queue/Cache hosts, but not Schedules yet.
  // Their injected proxy endpoints also enable its host-gateway mapping.
  if (
    container &&
    ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
  ) {
    endpoint.hostname = 'host.docker.internal';
  }
  return {
    VERCEL_SCHEDULE_BASE_URL: endpoint.toString().replace(/\/$/, ''),
    VERCEL_SCHEDULE_TOKEN: DEV_RESOURCE_TOKEN,
    VERCEL_SCHEDULE_DEV_API_VERSION: '1',
  };
}
