import chalk from 'chalk';
import ms from 'ms';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlags, getFlag } from '../../util/flags/get-flags';
import formatTable from '../../util/format-table';
import output from '../../output-manager';
import { FlagsLsTelemetryClient } from '../../util/telemetry/commands/flags/ls';
import { listSubcommand } from './command';
import type { Flag } from '../../util/flags/types';
import { formatProject } from '../../util/projects/format-project';

export default async function ls(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsLsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  const state = (flags['--state'] as 'active' | 'archived') || 'active';

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionState(state);

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project, org } = link;
  const projectSlugLink = formatProject(org.slug, project.name);

  try {
    if (flagArg) {
      // Show details of a specific flag
      const flag = await getFlag(client, project.id, flagArg);
      printFlagDetails(flag, projectSlugLink);
    } else {
      // List all flags
      const flagsList = await getFlags(client, project.id, state);
      if (flagsList.length === 0) {
        output.log(`No ${state} feature flags found for ${projectSlugLink}`);
      } else {
        output.log(
          `${chalk.bold(flagsList.length)} feature flag${flagsList.length === 1 ? '' : 's'} found for ${projectSlugLink}`
        );
        printFlagsTable(flagsList);
      }
    }
  } catch (err) {
    printError(err);
    return 1;
  }

  return 0;
}

function printFlagsTable(flags: Flag[]) {
  const headers = ['Name', 'Kind', 'State', 'Variants', 'Updated'];
  const now = Date.now();

  const rows = flags.map(flag => [
    chalk.bold(flag.slug),
    flag.kind,
    flag.state === 'active' ? chalk.green(flag.state) : chalk.gray(flag.state),
    String(flag.variants.length),
    ms(now - flag.updatedAt) + ' ago',
  ]);

  const table = formatTable(
    headers,
    ['l', 'l', 'l', 'r', 'l'],
    [{ name: '', rows }]
  );
  output.print(`\n${table}\n`);
}

function printFlagDetails(flag: Flag, projectSlugLink: string) {
  output.log(
    `\nFeature flag ${chalk.bold(flag.slug)} for ${projectSlugLink}\n`
  );

  output.print(`  ${chalk.dim('ID:')}           ${flag.id}\n`);
  output.print(`  ${chalk.dim('Kind:')}         ${flag.kind}\n`);
  output.print(
    `  ${chalk.dim('State:')}        ${flag.state === 'active' ? chalk.green(flag.state) : chalk.gray(flag.state)}\n`
  );

  if (flag.description) {
    output.print(`  ${chalk.dim('Description:')}  ${flag.description}\n`);
  }

  output.print(
    `  ${chalk.dim('Created:')}      ${ms(Date.now() - flag.createdAt)} ago\n`
  );
  output.print(
    `  ${chalk.dim('Updated:')}      ${ms(Date.now() - flag.updatedAt)} ago\n`
  );

  // Print variants
  output.print(`\n  ${chalk.dim('Variants:')}\n`);
  for (const variant of flag.variants) {
    const label = variant.label ? ` (${variant.label})` : '';
    output.print(
      `    ${chalk.cyan(variant.id)}${label}: ${chalk.yellow(JSON.stringify(variant.value))}\n`
    );
  }

  // Print environment configurations
  output.print(`\n  ${chalk.dim('Environments:')}\n`);
  for (const [envName, envConfig] of Object.entries(flag.environments)) {
    const status = envConfig.active
      ? chalk.green('active')
      : chalk.yellow('paused');
    output.print(`    ${chalk.bold(envName)}: ${status}\n`);

    if (envConfig.reuse?.active) {
      output.print(
        `      ${chalk.dim('Reuses:')} ${envConfig.reuse.environment}\n`
      );
    }

    if (envConfig.pausedOutcome) {
      output.print(
        `      ${chalk.dim('Paused variant:')} ${envConfig.pausedOutcome.variantId}\n`
      );
    }

    if (envConfig.fallthrough) {
      if (envConfig.fallthrough.type === 'variant') {
        output.print(
          `      ${chalk.dim('Default:')} ${envConfig.fallthrough.variantId}\n`
        );
      } else if (envConfig.fallthrough.type === 'split') {
        const weights = Object.entries(envConfig.fallthrough.weights)
          .map(([id, weight]) => `${id}: ${weight}%`)
          .join(', ');
        output.print(`      ${chalk.dim('Split:')} ${weights}\n`);
      }
    }

    if (envConfig.rules && envConfig.rules.length > 0) {
      output.print(`      ${chalk.dim('Rules:')} ${envConfig.rules.length}\n`);
    }
  }

  output.print('\n');
}
