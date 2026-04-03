import chalk from 'chalk';
import ms from 'ms';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getSdkKeys } from '../../util/flags/sdk-keys';
import formatTable from '../../util/format-table';
import output from '../../output-manager';
import { FlagsSdkKeysLsTelemetryClient } from '../../util/telemetry/commands/flags/sdk-keys';
import { sdkKeysListSubcommand } from './command';
import type { SdkKey } from '../../util/flags/types';
import { formatProject } from '../../util/projects/format-project';

export default async function sdkKeysLs(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsSdkKeysLsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    sdkKeysListSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { flags } = parsedArgs;
  const json = flags['--json'] as boolean | undefined;

  telemetryClient.trackCliFlagJson(json);

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
    output.spinner('Fetching SDK keys...');
    const keys = await getSdkKeys(client, project.id);
    output.stopSpinner();

    // Sort by createdAt descending (most recently created first)
    const sortedKeys = keys.sort((a, b) => b.createdAt - a.createdAt);

    if (json) {
      outputSdkKeysJson(client, sortedKeys);
    } else if (keys.length === 0) {
      output.log(`No SDK keys found for ${projectSlugLink}`);
      output.log(
        `\nCreate one with: ${getCommandName('flags sdk-keys add --type server --environment production')}`
      );
    } else {
      output.log(
        `${chalk.bold(keys.length)} SDK key${keys.length === 1 ? '' : 's'} found for ${projectSlugLink}`
      );
      printSdkKeysTable(sortedKeys);
    }
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

function outputSdkKeysJson(client: Client, keys: SdkKey[]) {
  const jsonOutput = {
    sdkKeys: keys.map(key => ({
      hashKey: key.hashKey,
      type: key.type,
      environment: key.environment,
      label: key.label ?? null,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    })),
  };
  client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
}

function printSdkKeysTable(keys: SdkKey[]) {
  const headers = ['Hash Key', 'Type', 'Environment', 'Label', 'Created'];
  const now = Date.now();

  const rows = keys.map(key => [
    chalk.dim(key.hashKey.slice(0, 12) + '...'),
    getTypeLabel(key.type),
    key.environment,
    key.label || chalk.dim('-'),
    ms(now - key.createdAt) + ' ago',
  ]);

  const table = formatTable(
    headers,
    ['l', 'l', 'l', 'l', 'l'],
    [{ name: '', rows }]
  );
  output.print(`\n${table}\n`);
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'server':
      return chalk.blue('server');
    case 'client':
      return chalk.green('client');
    case 'mobile':
      return chalk.yellow('mobile');
    default:
      return type;
  }
}
