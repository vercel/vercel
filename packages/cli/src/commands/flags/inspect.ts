import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlag, getFlagSettings } from '../../util/flags/get-flags';
import output from '../../output-manager';
import { FlagsInspectTelemetryClient } from '../../util/telemetry/commands/flags/inspect';
import { inspectSubcommand } from './command';
import { formatProject } from '../../util/projects/format-project';
import { printFlagDetails } from '../../util/flags/print-flag-details';

export default async function inspect(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsInspectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args } = parsedArgs;
  const [flagArg] = args;

  if (!flagArg) {
    output.error(
      `Missing required argument: flag. Usage: ${getCommandName('flags inspect <flag>')}`
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
  const projectSlugLink = formatProject(org.slug, project.name);

  try {
    const [flag, settings] = await Promise.all([
      getFlag(client, project.id, flagArg),
      getFlagSettings(client, project.id),
    ]);
    printFlagDetails({
      flag,
      settings,
      projectSlugLink,
      orgSlug: org.slug,
      projectName: project.name,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  return 0;
}
