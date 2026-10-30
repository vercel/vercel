import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getOrganization } from '../../util/organizations/api';
import { handleOrganizationApiError } from '../../util/organizations/errors';
import { outputFormat } from '../../util/organizations/args';
import { resolveOrganization } from '../../util/organizations/resolve';
import getTeamByIdOrSlug from '../../util/teams/get-team-by-id-or-slug';
import { OrganizationsTelemetryClient } from '../../util/telemetry/commands/organizations';
import output from '../../output-manager';
import { inspectSubcommand } from './command';
import { printOrganization, printResult, progress } from './output';

const USAGE = 'organizations inspect [organization]';

export default async function inspect(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { args, flags: opts } = parsedArgs;

  const telemetry = new OrganizationsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  telemetry.trackCliArgumentOrganizationId(args[0]);
  telemetry.trackCliOptionFormat(opts['--format']);
  telemetry.trackCliFlagJson(opts['--json']);

  const format = outputFormat(client, opts);
  if (format.status === 'error') return format.exitCode;

  const id = await resolveOrganization(client, args, USAGE);
  if (id.status === 'error') return id.exitCode;

  progress(format.value, 'Fetching organization…');
  let org: Awaited<ReturnType<typeof getOrganization>>;
  try {
    org = await getOrganization(client, id.value);
  } catch (err) {
    output.stopSpinner();
    return handleOrganizationApiError(client, err, {
      action: `fetch organization ${id.value}`,
      notFound: `Couldn't find organization ${id.value}.`,
    });
  }

  // The organization resource carries the root team's ID but not its slug, so
  // the human view pays one extra lookup for a name a reader recognizes. A
  // failed lookup falls back to the ID rather than failing the command.
  let rootTeamSlug: string | undefined;
  if (!format.value) {
    try {
      rootTeamSlug = (
        await getTeamByIdOrSlug(client, org.teamId, { useCurrentTeam: false })
      ).slug;
    } catch (err) {
      output.debug(`Root team lookup failed: ${err}`);
    }
  }

  printResult(client, format.value, { organization: org }, () =>
    printOrganization(client, org, { rootTeamSlug })
  );
  return 0;
}
