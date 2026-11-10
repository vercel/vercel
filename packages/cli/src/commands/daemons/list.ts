import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { validateOptionalIntegerRange } from '../../util/command-validation';
import { quoteArg } from '../../util/flags/quote-arg';
import cmd from '../../util/output/cmd';
import { printNextPageCommand } from '../../util/pagination';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { instancesListSubcommand, listSubcommand } from './command';
import * as api from './api';

function formatInstanceCounts(daemon: api.Daemon) {
  const counts = daemon.config?.instances;
  if (counts && typeof counts === 'object') {
    const regions = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort(
        ([a, countA], [b, countB]) => countB - countA || a.localeCompare(b)
      );
    const visible = regions.length > 4 ? regions.slice(0, 3) : regions;
    const hidden = regions.length - visible.length;
    const labels = visible.map(([region, count]) => `${region}:${count}`);
    if (hidden) labels.push(`+${hidden}`);
    return { label: labels.join(' ') || '0 instances', hidden };
  }
  const count = typeof counts === 'number' ? counts : daemon.instances.desired;
  return {
    label: `${count} ${count === 1 ? 'instance' : 'instances'}`,
    hidden: 0,
  };
}

/** `vercel daemons list` */
export async function list(client: Client, argv: string[]) {
  const USAGE = 'list';
  const parsed = api.parse(client, argv, listSubcommand.options, USAGE);
  if (typeof parsed === 'number') return parsed;
  const { args, flags, asJson } = parsed;
  if (args.length > 0) {
    return api.usageError(client, 'Expected no arguments.', USAGE);
  }
  const limit = validateOptionalIntegerRange(flags['--limit'], {
    flag: '--limit',
    min: 1,
    max: 100,
  });
  if (!limit.valid) return api.usageError(client, limit.message, USAGE);

  const link = await api.resolveProject(client, flags['--project']);
  if (typeof link === 'number') return link;

  try {
    if (!asJson) output.spinner(`Fetching daemons for ${link.target}`);
    const { daemons, pagination } =
      limit.value !== undefined || flags['--next'] !== undefined
        ? await api.fetchDaemonsPage(client, link.project, {
            limit: limit.value,
            next: flags['--next'],
          })
        : {
            daemons: await api.fetchAllDaemons(client, link.project),
            pagination: { next: undefined },
          };
    output.stopSpinner();
    if (asJson) {
      const next = pagination.next ?? null;
      return api.printJson(client, { daemons, pagination: { next } });
    }
    if (daemons.length === 0) {
      output.print(
        `  No production daemons in ${link.target}.\n\n  Add one under "daemons" in vercel.json, then deploy to production.\n`
      );
      return 0;
    }

    printAlignedLabel('Project', link.target);
    const instances = daemons.map(formatInstanceCounts);
    const isOverridden = (daemon: api.Daemon) =>
      daemon.config?.configuredInstances !== undefined;
    const rows = daemons.map((daemon, i) => [
      chalk.bold(daemon.name),
      api.formatStatus(daemon.status),
      `${daemon.instances.ready}/${daemon.instances.desired}`,
      `${instances[i].label}${isOverridden(daemon) ? ' *' : ''}`,
      api.formatAge(daemon.updatedAt),
    ]);
    const headers = ['Name', 'Status', 'Ready', 'Instances', 'Updated'];
    client.stdout.write(`\n${api.formatTable(headers, rows, 2)}\n\n`);

    const limitFlag = limit.value ? ` --limit ${limit.value}` : '';
    if (daemons.some(isOverridden)) {
      output.print('  * Scaling overridden.\n');
    }
    if (instances.some(({ hidden }) => hidden > 0)) {
      const cursorFlag = flags['--next']
        ? ` --next ${quoteArg(flags['--next'])}`
        : '';
      const command = api.daemonsCommand(
        client,
        `list --json${limitFlag}${cursorFlag}`
      );
      output.print(
        `  +N more regions. Show all region counts:\n    ${cmd(command)}\n`
      );
    }

    if (pagination.next) {
      const nextPage = `list${limitFlag} --next ${quoteArg(pagination.next)}`;
      const command = api.daemonsCommand(client, nextPage);
      printNextPageCommand(command);
    }
    return 0;
  } catch (err) {
    output.stopSpinner();
    return api.reportError(client, err);
  }
}

/** `vercel daemons instances list [daemon]` */
export async function instancesList(client: Client, argv: string[]) {
  const USAGE = 'instances list [daemon]';
  const options = instancesListSubcommand.options;
  const parsed = api.parse(client, argv, options, USAGE);
  if (typeof parsed === 'number') return parsed;
  const { args, flags, asJson, telemetry } = parsed;
  const [daemonName] = args;
  telemetry.trackCliArgumentDaemon(daemonName);
  if (args.length > 1) {
    return api.usageError(client, 'Expected at most one argument.', USAGE);
  }

  const link = await api.resolveProject(client, flags['--project']);
  if (typeof link === 'number') return link;

  try {
    if (!asJson) output.spinner(`Fetching daemon instances for ${link.target}`);
    const daemons = (await api.fetchAllDaemons(client, link.project)).filter(
      daemon => !daemonName || daemon.name === daemonName
    );
    output.stopSpinner();
    if (daemonName && daemons.length === 0) {
      return api.failure(
        client,
        AGENT_REASON.NOT_FOUND,
        `Couldn't find production daemon ${daemonName} in ${link.target}.`,
        { command: 'list', when: 'See the daemons' }
      );
    }
    const instances = daemons.flatMap(({ name, instances: { items } }) =>
      items.map(instance => ({ ...instance, daemon: name }))
    );
    if (asJson) return api.printJson(client, { instances });
    if (instances.length === 0) {
      output.print(`  No running daemon instances in ${link.target}.\n`);
      return 0;
    }

    printAlignedLabel('Project', link.target);
    const rows = instances.map(instance => [
      chalk.bold(instance.id),
      instance.daemon,
      instance.region,
      api.formatStatus(api.formatInstanceState(instance)),
      api.formatAge(instance.startedAt),
    ]);
    const headers = ['Instance', 'Daemon', 'Region', 'Status', 'Started'];
    client.stdout.write(`\n${api.formatTable(headers, rows)}\n\n`);
    return 0;
  } catch (err) {
    output.stopSpinner();
    return api.reportError(client, err);
  }
}
