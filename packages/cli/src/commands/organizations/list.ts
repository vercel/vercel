import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { listOrganizations } from '../../util/organizations/api';
import { handleOrganizationApiError } from '../../util/organizations/errors';
import {
  invalidArgument,
  listWindow,
  noArguments,
  outputFormat,
} from '../../util/organizations/args';
import { sliceList } from '../../util/organizations/pagination';
import { printNextPageHint } from '../../util/pagination';
import table from '../../util/output/table';
import { OrganizationsTelemetryClient } from '../../util/telemetry/commands/organizations';
import output from '../../output-manager';
import { listSubcommand } from './command';
import { printResult, progress } from './output';

const USAGE = 'organizations list';

export default async function list(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
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
  telemetry.trackCliOptionFormat(opts['--format']);
  telemetry.trackCliFlagJson(opts['--json']);
  telemetry.trackCliOptionLimit(opts['--limit']);
  telemetry.trackCliOptionNext(opts['--next']);

  const format = outputFormat(client, opts);
  if (format.status === 'error') return format.exitCode;

  const empty = noArguments(client, args, USAGE);
  if (empty.status === 'error') return empty.exitCode;

  const window = listWindow(client, opts);
  if (window.status === 'error') return window.exitCode;

  progress(format.value, 'Fetching organizations…');
  let result: Awaited<ReturnType<typeof listOrganizations>>;
  try {
    result = await listOrganizations(client);
  } catch (err) {
    output.stopSpinner();
    return handleOrganizationApiError(client, err, {
      action: 'list organizations',
    });
  }

  const page = sliceList(
    result.organizations,
    window.value.start,
    window.value.limit
  );
  if (!page) {
    output.stopSpinner();
    return invalidArgument(
      client,
      'Provide --next with the cursor from the previous page.'
    );
  }

  printResult(
    client,
    format.value,
    { organizations: page.items, pagination: { next: page.next } },
    () => {
      if (!page.items.length) {
        output.log(
          opts['--next'] ? 'No more organizations.' : 'No organizations.'
        );
        return;
      }
      // The table is the result, so it goes to stdout and stays pipeable.
      // Status, spinners, and errors stay on the managed stderr stream.
      client.stdout.write(
        `${table(
          [
            ['ID', 'Slug', 'Root Team', 'Teams'],
            ...page.items.map(org => [
              org.organizationId,
              org.slug,
              org.teamId,
              String(org.teamCount),
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
