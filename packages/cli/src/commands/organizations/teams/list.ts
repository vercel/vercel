import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import {
  type OrganizationTeamListItem,
  listOrganizationTeams,
} from '../../../util/organizations/api';
import { handleOrganizationApiError } from '../../../util/organizations/errors';
import { listWindow, outputFormat } from '../../../util/organizations/args';
import {
  type ListPage,
  collectList,
} from '../../../util/organizations/pagination';
import { printNextPageHint } from '../../../util/pagination';
import { resolveOrganization } from '../../../util/organizations/resolve';
import table from '../../../util/output/table';
import { OrganizationsTelemetryClient } from '../../../util/telemetry/commands/organizations';
import output from '../../../output-manager';
import { teamsListSubcommand } from '../command';
import { printResult, progress } from '../output';

const USAGE = 'organizations teams list [organization]';

export default async function list(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(teamsListSubcommand.options);
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
  telemetry.trackCliOptionLimit(opts['--limit']);
  telemetry.trackCliOptionNext(opts['--next']);

  const format = outputFormat(client, opts);
  if (format.status === 'error') return format.exitCode;

  const window = listWindow(client, opts);
  if (window.status === 'error') return window.exitCode;

  const id = await resolveOrganization(client, args, USAGE);
  if (id.status === 'error') return id.exitCode;

  progress(format.value, 'Fetching organization teams…');
  let page: ListPage<OrganizationTeamListItem>;
  try {
    page = await collectList(
      async cursor => {
        const result = await listOrganizationTeams(client, id.value, cursor);
        return { items: result.teams, cursor: result.cursor ?? null };
      },
      window.value.start,
      window.value.limit
    );
  } catch (err) {
    output.stopSpinner();
    return handleOrganizationApiError(client, err, {
      action: `list teams in organization ${id.value}`,
      notFound: `Couldn't find organization ${id.value}.`,
    });
  }

  printResult(
    client,
    format.value,
    { teams: page.items, pagination: { next: page.next } },
    () => {
      if (!page.items.length) {
        output.log(
          opts['--next']
            ? 'No more teams.'
            : `No teams in organization ${id.value}.`
        );
        return;
      }
      // The table is the result, so it goes to stdout and stays pipeable.
      client.stdout.write(
        `${table(
          [
            ['ID', 'Slug', 'Name', 'Billing Plan'],
            ...page.items.map(team => [
              team.teamId,
              team.slug,
              team.name ?? '-',
              team.billingPlan ?? '-',
            ]),
          ],
          { hsep: 2 }
        )}\n`
      );
      printNextPageHint(client, page.next);
    }
  );
  return 0;
}
