import ms from 'ms';
import ora from 'ora';
import type { NetworkPolicy, Sandbox } from '@vercel/sandbox';
import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import { help } from '../../help';
import output from '../../../output-manager';
import getScope from '../../../util/get-scope';
import { sandboxCommand } from '../command';
import { createSubcommand } from './command';
import {
  resolveSandboxTarget,
  SandboxTargetError,
} from '../../../util/sandbox/target';
import { sandboxClient } from '../../../util/sandbox/client';
import {
  connectToSandbox,
  assertInteractivePort,
} from '../../../util/sandbox/exec-core';
import { printSandboxSummary } from '../../../util/sandbox/print-sandbox-summary';
import {
  buildKeepLastSnapshots,
  buildNetworkPolicy,
  parseDuration,
  parseKeyValues,
  parseNetworkPolicyMode,
  parsePort,
  parseRuntime,
  parseSnapshotExpiration,
  parseSnapshotId,
  parseVcpus,
  type Runtime,
} from '../../../util/sandbox/args';

type CreateFlagsSpec = ReturnType<
  typeof getFlagsSpecification<typeof createSubcommand.options>
>;
export type CreateFlags = ReturnType<
  typeof parseArguments<CreateFlagsSpec>
>['flags'];

export interface CreateSandboxOptions {
  project?: string;
  name?: string;
  nonPersistent: boolean;
  runtime?: Runtime;
  image?: string;
  timeout: string;
  vcpus?: number;
  ports: number[];
  silent: boolean;
  snapshot?: string;
  connect: boolean;
  env: Record<string, string>;
  tags: Record<string, string>;
  snapshotExpiration?: string;
  keepLastSnapshots?: number;
  keepLastSnapshotsFor?: string;
  deleteEvictedSnapshots?: string;
  networkPolicy?: 'allow-all' | 'deny-all';
  allowedDomains: string[];
  allowedCIDRs: string[];
  deniedCIDRs: string[];
}

// Consumed directly by `sh` (Task 9) and `run` (Task 11): both call this with
// their own parsed opts instead of going through the CLI-arg-parsing path
// below, so all create validation/behavior must live here rather than in the
// default handler.
export async function runCreate(
  client: Client,
  opts: CreateSandboxOptions
): Promise<Sandbox> {
  if (opts.image && opts.runtime) {
    throw new Error('--image and --runtime cannot be used together.');
  }

  const networkPolicy: NetworkPolicy =
    buildNetworkPolicy({
      networkPolicy: opts.networkPolicy,
      allowedDomains: opts.allowedDomains,
      allowedCIDRs: opts.allowedCIDRs,
      deniedCIDRs: opts.deniedCIDRs,
    }) ?? 'allow-all';

  const keepLastSnapshots = buildKeepLastSnapshots({
    keepLastSnapshots: opts.keepLastSnapshots,
    keepLastSnapshotsFor: opts.keepLastSnapshotsFor,
    deleteEvictedSnapshots: opts.deleteEvictedSnapshots,
  });

  const { token, teamId, projectId } = await resolveSandboxTarget(client, {
    project: opts.project,
  });

  const persistent = !opts.nonPersistent;
  const resources = opts.vcpus ? { vcpus: opts.vcpus } : undefined;
  const tags = Object.keys(opts.tags).length > 0 ? opts.tags : undefined;
  const spinner = opts.silent ? undefined : ora('Creating sandbox...').start();

  const sandbox = opts.snapshot
    ? await sandboxClient.create({
        name: opts.name,
        source: { type: 'snapshot', snapshotId: opts.snapshot },
        teamId,
        projectId,
        token,
        ports: opts.ports,
        timeout: ms(opts.timeout),
        resources,
        networkPolicy,
        env: opts.env,
        tags,
        persistent,
        snapshotExpiration: opts.snapshotExpiration
          ? ms(opts.snapshotExpiration)
          : undefined,
        keepLastSnapshots,
        __interactive: true,
      })
    : await sandboxClient.create({
        name: opts.name,
        teamId,
        projectId,
        token,
        ports: opts.ports,
        ...(opts.image
          ? { image: opts.image }
          : { runtime: opts.runtime ?? 'node24' }),
        timeout: ms(opts.timeout),
        resources,
        networkPolicy,
        env: opts.env,
        tags,
        persistent,
        snapshotExpiration: opts.snapshotExpiration
          ? ms(opts.snapshotExpiration)
          : undefined,
        keepLastSnapshots,
        __interactive: true,
      });

  spinner?.stop();

  assertInteractivePort(sandbox, 'created');

  if (!opts.silent) {
    const { contextName } = await getScope(client);
    printSandboxSummary({ sandbox, contextName, action: 'created' });
  }

  if (opts.connect) {
    await connectToSandbox(sandbox);
  }

  return sandbox;
}

// Maps parsed create flags to CreateSandboxOptions. Consumed by `create` and,
// via Task 9's `sh` command, by any subcommand that reuses the create flow.
export function buildCreateOptions(flags: CreateFlags): CreateSandboxOptions {
  return {
    project: flags['--project'],
    name: flags['--name'],
    nonPersistent: Boolean(flags['--non-persistent']),
    runtime: flags['--runtime'] ? parseRuntime(flags['--runtime']) : undefined,
    image: flags['--image'],
    timeout: parseDuration(flags['--timeout'] ?? '5m'),
    vcpus:
      flags['--vcpus'] !== undefined ? parseVcpus(flags['--vcpus']) : undefined,
    ports: (flags['--publish-port'] ?? []).map(parsePort),
    silent: Boolean(flags['--silent']),
    snapshot: flags['--snapshot']
      ? parseSnapshotId(flags['--snapshot'])
      : undefined,
    connect: Boolean(flags['--connect']),
    env: parseKeyValues(flags['--env'] ?? []),
    tags: parseKeyValues(flags['--tag'] ?? []),
    snapshotExpiration: flags['--snapshot-expiration']
      ? parseSnapshotExpiration(flags['--snapshot-expiration'])
      : undefined,
    keepLastSnapshots: flags['--keep-last-snapshots'],
    keepLastSnapshotsFor: flags['--keep-last-snapshots-for']
      ? parseSnapshotExpiration(flags['--keep-last-snapshots-for'])
      : undefined,
    deleteEvictedSnapshots: flags['--delete-evicted-snapshots'],
    networkPolicy: flags['--network-policy']
      ? parseNetworkPolicyMode(flags['--network-policy'])
      : undefined,
    allowedDomains: flags['--allowed-domain'] ?? [],
    allowedCIDRs: flags['--allowed-cidr'] ?? [],
    deniedCIDRs: flags['--denied-cidr'] ?? [],
  };
}

export default async function create(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(createSubcommand.options)
    );
  } catch (err) {
    printError(err);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(
      help(createSubcommand, {
        parent: sandboxCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  try {
    await runCreate(client, buildCreateOptions(parsedArgs.flags));

    return 0;
  } catch (err) {
    printError(err);
    return err instanceof SandboxTargetError ? err.exitCode : 1;
  }
}
