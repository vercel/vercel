import type { ServiceBinding } from './types';

/** Instance counts by region. */
export type DaemonInstances = Record<string, number>;

/** @deprecated Use `DaemonInstances`. */
export type DaemonReplicas = DaemonInstances;

export interface DaemonResources {
  requests: { memory: '1Gi' | '2Gi' | '4Gi' | '8Gi' };
}

/** A Kubernetes-style HTTP liveness probe. */
export interface DaemonLivenessProbe {
  httpGet: {
    path?: string;
    port: number;
    host?: string;
    scheme?: 'HTTP' | 'HTTPS';
    httpHeaders?: Array<{ name: string; value: string }>;
  };
  initialDelaySeconds?: number;
  periodSeconds?: number;
  timeoutSeconds?: number;
  successThreshold?: number;
  failureThreshold?: number;
}

/** A `vercel.json#daemons` entry. */
export interface DaemonConfig {
  root: string;
  entrypoint: string;
  command?: string[];
  instances?: DaemonInstances;
  /** @deprecated Use `instances`. Ignored when `instances` is set. */
  replicas?: DaemonInstances;
  resources?: DaemonResources;
  terminationGracePeriodSeconds?: number;
  livenessProbe?: DaemonLivenessProbe;
  /** Bindings to services in the same deployment. */
  bindings?: Array<Required<ServiceBinding>>;
}

/**
 * Valid daemon names: service names, minus separator runs that aren't valid
 * in an image repository name (`a___b`, `a_-b`), because each daemon's image
 * gets its own repository named after it.
 */
export const DAEMON_NAME_PATTERN = '^[a-z]+(?:(?:_|__|-+)[a-z]+)*$';

/** Map of daemon name to daemon configuration for `vercel.json#daemons`. */
export type Daemons = Record<string, DaemonConfig>;

/** Build Output API descriptor written to `daemons/<name>/.vc-config.json`. */
export interface DaemonOutput {
  runtime: 'container';
  image: string;
  command?: string[];
  instances: DaemonInstances;
  resources?: DaemonResources;
  terminationGracePeriodSeconds?: number;
  livenessProbe?: DaemonLivenessProbe;
  bindings?: Array<Required<ServiceBinding>>;
}

/**
 * Names of the daemons in `vercel.json#daemons`. Safe on unvalidated config,
 * where `daemons` may not be an object.
 */
export function getDaemonNames(
  config: { daemons?: unknown } | null | undefined
): string[] {
  const daemons = config?.daemons;
  if (
    typeof daemons !== 'object' ||
    daemons === null ||
    Array.isArray(daemons)
  ) {
    return [];
  }
  return Object.keys(daemons);
}

/**
 * The VCR repository a daemon's image is pushed to, under the project's
 * namespace. Service names can't contain `.`, so it never matches a service's
 * repository, which is named after the service. Repeated dashes collapse like
 * they do for services, so `a-b` and `a--b` share one.
 */
export function getDaemonImageRepository(name: string): string {
  return `daemon.${name.replace(/-+/g, '-')}`;
}
