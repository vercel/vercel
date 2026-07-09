import ms from 'ms';
import ora from 'ora';
import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import { help } from '../../help';
import output from '../../../output-manager';
import getScope from '../../../util/get-scope';
import { sandboxCommand } from '../command';
import { forkSubcommand } from './command';
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
  assertSandboxName,
  buildKeepLastSnapshots,
  buildNetworkPolicy,
  parseDuration,
  parseKeyValues,
  parseNetworkPolicyMode,
  parsePort,
  parseSnapshotExpiration,
  parseVcpus,
} from '../../../util/sandbox/args';

export default async function fork(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(forkSubcommand.options)
    );
  } catch (err) {
    printError(err);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(
      help(forkSubcommand, {
        parent: sandboxCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  const [source] = parsedArgs.args;

  try {
    assertSandboxName(source);

    const flags = parsedArgs.flags;

    const networkPolicyMode = flags['--network-policy']
      ? parseNetworkPolicyMode(flags['--network-policy'])
      : undefined;
    const allowedDomains = flags['--allowed-domain'] ?? [];
    const allowedCIDRs = flags['--allowed-cidr'] ?? [];
    const deniedCIDRs = flags['--denied-cidr'] ?? [];
    const networkPolicyProvided =
      networkPolicyMode !== undefined ||
      allowedDomains.length > 0 ||
      allowedCIDRs.length > 0 ||
      deniedCIDRs.length > 0;
    const networkPolicy = networkPolicyProvided
      ? buildNetworkPolicy({
          networkPolicy: networkPolicyMode,
          allowedDomains,
          allowedCIDRs,
          deniedCIDRs,
        })
      : undefined;

    const keepLastSnapshots = buildKeepLastSnapshots({
      keepLastSnapshots: flags['--keep-last-snapshots'],
      keepLastSnapshotsFor: flags['--keep-last-snapshots-for']
        ? parseSnapshotExpiration(flags['--keep-last-snapshots-for'])
        : undefined,
      deleteEvictedSnapshots: flags['--delete-evicted-snapshots'],
    });

    const tags = parseKeyValues(flags['--tag'] ?? []);
    const tagsObj = Object.keys(tags).length > 0 ? tags : undefined;
    const env = parseKeyValues(flags['--env'] ?? []);
    const envObj = Object.keys(env).length > 0 ? env : undefined;

    const name = flags['--name'];
    const ports = (flags['--publish-port'] ?? []).map(parsePort);
    const timeout = flags['--timeout']
      ? parseDuration(flags['--timeout'])
      : undefined;
    const vcpus =
      flags['--vcpus'] !== undefined ? parseVcpus(flags['--vcpus']) : undefined;
    const nonPersistent = Boolean(flags['--non-persistent']);
    const snapshotExpiration = flags['--snapshot-expiration']
      ? parseSnapshotExpiration(flags['--snapshot-expiration'])
      : undefined;
    const silent = Boolean(flags['--silent']);
    const connect = Boolean(flags['--connect']);

    const { token, teamId, projectId } = await resolveSandboxTarget(client, {
      project: flags['--project'],
    });

    const spinner = silent
      ? undefined
      : ora(`Forking sandbox ${source}...`).start();

    const sandbox = await sandboxClient.fork({
      sourceSandbox: source,
      teamId,
      projectId,
      token,
      ...(name !== undefined && { name }),
      ...(ports.length > 0 && { ports }),
      ...(timeout !== undefined && { timeout: ms(timeout) }),
      ...(vcpus !== undefined && { resources: { vcpus } }),
      ...(networkPolicy !== undefined && { networkPolicy }),
      ...(envObj !== undefined && { env: envObj }),
      ...(tagsObj !== undefined && { tags: tagsObj }),
      ...(nonPersistent && { persistent: false }),
      ...(snapshotExpiration !== undefined && {
        snapshotExpiration: ms(snapshotExpiration),
      }),
      ...(keepLastSnapshots !== undefined && { keepLastSnapshots }),
      __interactive: true,
    });

    spinner?.stop();

    assertInteractivePort(sandbox, 'forked');

    if (!silent) {
      const { contextName } = await getScope(client);
      printSandboxSummary({
        sandbox,
        contextName,
        action: `forked from ${source}`,
      });
    }

    if (connect) {
      await connectToSandbox(sandbox);
    }

    return 0;
  } catch (err) {
    printError(err);
    return err instanceof SandboxTargetError ? err.exitCode : 1;
  }
}
