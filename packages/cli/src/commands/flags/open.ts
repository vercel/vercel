import open from 'open';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlag } from '../../util/flags/get-flags';
import {
  getFlagDashboardUrl,
  getFlagsDashboardUrl,
} from '../../util/flags/dashboard-url';
import output from '../../output-manager';
import { FlagsOpenTelemetryClient } from '../../util/telemetry/commands/flags/open';
import { openSubcommand } from './command';

export default async function openFlag(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsOpenTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(openSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args } = parsedArgs;
  const [flagArg, extraArg] = args;

  if (extraArg) {
    output.error(
      `Too many arguments. Usage: ${getCommandName('flags open [flag]')}`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);

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

  try {
    let url = getFlagsDashboardUrl(org.slug, project.name);
    let label = 'feature flags dashboard';

    if (flagArg) {
      output.spinner('Fetching flag...');
      const flag = await getFlag(client, project.id, flagArg);
      output.stopSpinner();

      url = getFlagDashboardUrl(org.slug, project.name, flag.slug);
      label = `feature flag ${flag.slug}`;
    }

    if (client.stdout.isTTY) {
      output.log(`Opening ${label} in your browser...`);
      output.log(`Visit this URL if the browser does not open: ${url}`);
      void open(url).catch(() => undefined);
    } else {
      client.stdout.write(`${url}\n`);
    }
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
