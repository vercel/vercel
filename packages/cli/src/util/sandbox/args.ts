/**
 * Shared sandbox arg parsing/validation helpers, consumed by the PR #2
 * (create/exec/fork/run), PR #3 (snapshots), and PR #4 (config) command
 * handlers.
 */

import chalk from 'chalk';
import ms from 'ms';
import type { NetworkPolicy } from '@vercel/sandbox';

export function parseKeyValues(pairs: string[]): Record<string, string> {
  const obj: Record<string, string> = Object.create(null);
  const missingVars: string[] = [];

  for (const input of pairs) {
    let key: string;
    let value: string | undefined;
    if (!input.includes('=')) {
      key = input;
      value = process.env[input];
    } else {
      const [first, ...rest] = input.split('=');
      key = first;
      value = rest.join('=');
    }

    if (value === undefined) {
      missingVars.push(key);
    } else {
      obj[key] = value;
    }
  }

  if (missingVars.length > 0) {
    const plural = missingVars.length > 1;
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(
      chalk.yellow(
        [
          `${chalk.bold('warn:')} env var${plural ? 's were' : ' was'} not defined and ${plural ? 'were' : 'was'} not passed: ${missingVars.join(', ')}`,
          `╰▶ ${chalk.bold('hint:')} --env VAR is equivalent to --env VAR=$VAR`,
        ].join('\n')
      )
    );
  }

  return obj;
}

const DURATION_REGEX =
  /^(\d+) ?(ms|milliseconds?|msecs?|s(?:econds?)?|m(?:inutes?)?|h(?:ours?)?|d(?:ays?)?)?$/;

export function parseDuration(value: string): string {
  const match = value.match(DURATION_REGEX);
  if (!match) {
    throw new Error(
      [
        `Malformed duration: "${value}".`,
        `${chalk.bold('hint:')} Use a number followed by a unit: s (seconds), m (minutes), h (hours), d (days).`,
        '╰▶ Examples: 30s, 5m, 2h, 1d',
      ].join('\n')
    );
  }
  return match[0];
}

export function parseSnapshotExpiration(value: string): string {
  if (value === 'none') {
    return '0';
  }
  return parseDuration(value);
}

export const RUNTIMES = ['node22', 'node24', 'node26', 'python3.13'] as const;
export type Runtime = (typeof RUNTIMES)[number];

export function parseRuntime(value: string): Runtime {
  if (!(RUNTIMES as readonly string[]).includes(value)) {
    throw new Error(
      `Invalid runtime: "${value}". Must be one of: ${RUNTIMES.join(', ')}.`
    );
  }
  return value as Runtime;
}

export function parseVcpus(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `Invalid vCPU count: ${value}. Must be a positive integer.`
    );
  }
  return value;
}

export function parsePort(value: number): number {
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error(
      [
        `Invalid port: ${value}.`,
        `${chalk.bold('hint:')} Ports must be integers between 1024-65535 (privileged ports 0-1023 are reserved).`,
        'Examples: 3000, 8443',
      ].join('\n')
    );
  }
  return value;
}

export function parseNetworkPolicyMode(
  value: string
): 'allow-all' | 'deny-all' {
  const validModes = ['allow-all', 'deny-all'];
  if (!validModes.includes(value)) {
    throw new Error(
      [
        `Invalid network policy mode: ${value}.`,
        `${chalk.bold('hint:')} Valid modes are: ${validModes.join(', ')}`,
      ].join('\n')
    );
  }
  return value as 'allow-all' | 'deny-all';
}

// Unlike the source's `buildNetworkPolicy`, this returns `undefined` (not
// `'allow-all'`) when no network flags are given. `create` (Task 7) must
// apply `?? 'allow-all'`; `fork` must not, so it inherits the source policy.
export function buildNetworkPolicy(opts: {
  networkPolicy?: 'allow-all' | 'deny-all';
  allowedDomains: string[];
  allowedCIDRs: string[];
  deniedCIDRs: string[];
}): NetworkPolicy | undefined {
  const { networkPolicy, allowedDomains, allowedCIDRs, deniedCIDRs } = opts;

  const hasListOptions =
    allowedDomains.length > 0 ||
    allowedCIDRs.length > 0 ||
    deniedCIDRs.length > 0;

  if (networkPolicy && hasListOptions) {
    throw new Error(
      [
        `Cannot combine --network-policy=${networkPolicy} with --allowed-domain, --allowed-cidr, or --denied-cidr.`,
        `${chalk.bold('hint:')} Use --allowed-domain / --allowed-cidr / --denied-cidr without --network-policy for custom policies.`,
      ].join('\n')
    );
  }

  if (hasListOptions) {
    return {
      ...(allowedDomains.length > 0 && { allow: allowedDomains }),
      ...((allowedCIDRs.length > 0 || deniedCIDRs.length > 0) && {
        subnets: {
          ...(allowedCIDRs.length > 0 && { allow: allowedCIDRs }),
          ...(deniedCIDRs.length > 0 && { deny: deniedCIDRs }),
        },
      }),
    };
  }

  return networkPolicy;
}

export function parseSnapshotId(value: string): string {
  if (!value.startsWith('snap_')) {
    throw new Error(
      [
        `Malformed snapshot ID: "${value}".`,
        `${chalk.bold('hint:')} Snapshot IDs must start with 'snap_' (e.g., snap_abc123def456).`,
      ].join('\n')
    );
  }
  return value;
}

export interface KeepLastSnapshotsPayload {
  count: number;
  expiration: number | undefined;
  deleteEvicted: boolean | undefined;
}

export function buildKeepLastSnapshots(opts: {
  keepLastSnapshots: number | undefined;
  keepLastSnapshotsFor: string | undefined;
  deleteEvictedSnapshots: string | undefined;
}): KeepLastSnapshotsPayload | undefined {
  const { keepLastSnapshots, keepLastSnapshotsFor, deleteEvictedSnapshots } =
    opts;

  if (
    deleteEvictedSnapshots !== undefined &&
    deleteEvictedSnapshots !== 'true' &&
    deleteEvictedSnapshots !== 'false'
  ) {
    throw new Error(
      `Invalid --delete-evicted-snapshots value: ${deleteEvictedSnapshots}. Must be "true" or "false".`
    );
  }

  if (
    keepLastSnapshots !== undefined &&
    (!Number.isInteger(keepLastSnapshots) ||
      keepLastSnapshots < 1 ||
      keepLastSnapshots > 10)
  ) {
    throw new Error(
      `Invalid --keep-last-snapshots value: ${keepLastSnapshots}. Must be an integer between 1 and 10.`
    );
  }

  if (
    keepLastSnapshots === undefined &&
    (keepLastSnapshotsFor !== undefined || deleteEvictedSnapshots !== undefined)
  ) {
    throw new Error(
      [
        '--keep-last-snapshots-for and --delete-evicted-snapshots require --keep-last-snapshots.',
        `${chalk.bold('hint:')} Pass --keep-last-snapshots <count> to enable the retention policy.`,
      ].join('\n')
    );
  }

  if (keepLastSnapshots === undefined) {
    return undefined;
  }

  return {
    count: keepLastSnapshots,
    expiration:
      keepLastSnapshotsFor !== undefined ? ms(keepLastSnapshotsFor) : undefined,
    deleteEvicted:
      deleteEvictedSnapshots !== undefined
        ? deleteEvictedSnapshots === 'true'
        : undefined,
  };
}

export function assertSandboxName(value: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      [
        'Sandbox name cannot be empty.',
        `${chalk.bold('hint:')} Provide a sandbox name.`,
        '╰▶ run `sandbox list` to see available sandboxes.',
      ].join('\n')
    );
  }
  return value;
}
