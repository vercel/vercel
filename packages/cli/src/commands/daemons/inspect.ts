import type Client from '../../util/client';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import cmd from '../../util/output/cmd';
import formatDate from '../../util/format-date';
import {
  formatAlignedLabel,
  printAlignedLabel,
} from '../../util/output/print-aligned-label';
import { inspectSubcommand } from './command';
import * as api from './api';

function countsByRegion(counts: number | Record<string, number> | undefined) {
  return typeof counts === 'number' ? { iad1: counts } : counts;
}

function regionalCounts(daemon: api.Daemon, memoryMiB: number | undefined) {
  const desired = countsByRegion(daemon.config?.instances);
  const configured = countsByRegion(
    daemon.config?.configuredInstances ?? daemon.config?.instances
  );
  const image = daemon.config?.image?.resolved;
  const canCountReady =
    image !== undefined && memoryMiB !== undefined && desired !== undefined;
  const regions = new Set([
    ...Object.keys(configured ?? {}),
    ...Object.keys(desired ?? {}),
    ...daemon.instances.items.map(instance => instance.region),
  ]);
  const ready = new Map<string, number>();
  const alive = new Map<string, number>();
  for (const instance of daemon.instances.items) {
    if (instance.stoppedAt) continue;
    if (instance.alive) {
      alive.set(instance.region, (alive.get(instance.region) ?? 0) + 1);
    }
    if (
      canCountReady &&
      instance.image === image &&
      instance.memoryMiB === memoryMiB
    ) {
      ready.set(instance.region, (ready.get(instance.region) ?? 0) + 1);
    }
  }
  return [...regions].sort().map(region => {
    const desiredCount = desired ? (desired[region] ?? 0) : null;
    return {
      region,
      configured: configured ? (configured[region] ?? 0) : null,
      desired: desiredCount,
      ready:
        desiredCount === 0
          ? 0
          : canCountReady && desiredCount !== null
            ? Math.min(desiredCount, ready.get(region) ?? 0)
            : null,
      alive: alive.get(region) ?? 0,
    };
  });
}

/** `vercel daemons inspect <daemon>` */
export default async function inspect(client: Client, argv: string[]) {
  const USAGE = 'inspect <daemon>';
  const parsed = api.parse(client, argv, inspectSubcommand.options, USAGE);
  if (typeof parsed === 'number') return parsed;
  const { args, flags, asJson, telemetry } = parsed;
  const [daemonName] = args;
  telemetry.trackCliArgumentDaemon(daemonName);
  if (args.length === 0) {
    return api.failure(
      client,
      AGENT_REASON.INVALID_ARGUMENTS,
      'A daemon name is required.',
      { command: 'list', when: 'List available daemons' },
      2
    );
  }
  if (args.length !== 1 || !api.DAEMON_NAME_PATTERN.test(daemonName)) {
    return api.usageError(client, 'Expected one valid daemon name.', USAGE);
  }
  const link = await api.resolveProject(client, flags['--project']);
  if (typeof link === 'number') return link;

  try {
    if (!asJson) output.spinner(`Fetching daemon ${daemonName}`);
    const daemon = (await api.fetchAllDaemons(client, link.project)).find(
      item => item.name === daemonName
    );
    output.stopSpinner();
    if (!daemon) {
      return api.failure(
        client,
        AGENT_REASON.NOT_FOUND,
        `Couldn't find production daemon ${daemonName} in ${link.target}.`,
        { command: 'list', when: 'List available daemons' }
      );
    }

    const memory = daemon.config?.resources?.requests.memory;
    const memoryMatch = /^(\d+)Mi$/.exec(memory ?? '');
    const memoryMiB = memoryMatch ? Number(memoryMatch[1]) : undefined;
    const regions = regionalCounts(daemon, memoryMiB);
    const scalingOverridden = daemon.config?.configuredInstances !== undefined;
    const next = api.daemonsCommand(client, `instances list ${daemonName}`);
    if (asJson) {
      return api.printJson(client, {
        daemon,
        context: {
          project: { id: link.project.id, name: link.project.name },
          team: { id: link.org.id, slug: link.org.slug },
          environment: 'production',
        },
        scalingOverridden,
        regions,
        next: [{ command: next, when: "List the daemon's instances" }],
      });
    }

    printAlignedLabel('Project', link.target);
    printAlignedLabel('Environment', 'Production');
    const details: Array<[string, string | undefined]> = [
      ['Daemon', daemon.name],
      ['Status', api.formatStatus(daemon.status)],
      ['Ready', `${daemon.instances.ready}/${daemon.instances.desired}`],
      ['Overrides', scalingOverridden ? 'Active' : 'None'],
      ['Deployment ID', daemon.deploymentId],
      [
        'Image',
        daemon.config?.image?.resolved ?? daemon.config?.image?.requested,
      ],
      [
        'Memory/instance',
        memoryMiB === undefined ? memory : `${memoryMiB} MiB`,
      ],
      ['Updated', formatDate(daemon.updatedAt)],
    ];
    const lines = details.flatMap(([label, value]) =>
      value ? [formatAlignedLabel(label, value)] : []
    );
    client.stdout.write(`\n${lines.join('\n')}\n\n`);
    if (regions.length) {
      const rows = regions.map(
        ({ region, configured, desired, ready, alive }) => [
          region,
          configured === null ? '-' : String(configured),
          desired === null ? '-' : String(desired),
          ready === null ? '-' : String(ready),
          String(alive),
        ]
      );
      const headers = ['Region', 'Configured', 'Desired', 'Ready', 'Alive'];
      client.stdout.write(`${api.formatTable(headers, rows, 2)}\n\n`);
    }
    output.print(`  List the daemon's instances:\n    ${cmd(next)}\n`);
    return 0;
  } catch (err) {
    output.stopSpinner();
    return api.reportError(client, err);
  }
}
