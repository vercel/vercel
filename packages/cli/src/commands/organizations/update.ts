import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { updateOrganization } from '../../util/organizations/api';
import { handleOrganizationApiError } from '../../util/organizations/errors';
import {
  SLUG_MESSAGE,
  outputFormat,
  slugSchema,
  validate,
} from '../../util/organizations/args';
import { resolveOrganization } from '../../util/organizations/resolve';
import { OrganizationsTelemetryClient } from '../../util/telemetry/commands/organizations';
import output from '../../output-manager';
import { updateSubcommand } from './command';
import {
  printOrganization,
  printResult,
  printStdoutIdentifier,
  progress,
} from './output';

const USAGE = 'organizations update [organization] --slug <slug>';

export default async function update(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(updateSubcommand.options);
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
  telemetry.trackCliOptionSlug(opts['--slug']);

  const format = outputFormat(client, opts);
  if (format.status === 'error') return format.exitCode;

  const slug = validate(client, slugSchema, opts['--slug'], {
    message: SLUG_MESSAGE,
    usage: USAGE,
  });
  if (slug.status === 'error') return slug.exitCode;

  const id = await resolveOrganization(client, args, USAGE);
  if (id.status === 'error') return id.exitCode;

  progress(format.value, 'Updating organization…');
  let org: Awaited<ReturnType<typeof updateOrganization>>;
  try {
    org = await updateOrganization(client, id.value, slug.value);
  } catch (err) {
    output.stopSpinner();
    return handleOrganizationApiError(client, err, {
      action: `update organization ${id.value}`,
      notFound: `Couldn't find organization ${id.value}.`,
    });
  }

  printResult(
    client,
    format.value,
    { organization: org, outcome: 'updated' },
    () => {
      printOrganization(client, org, { action: 'Updated' });
      printStdoutIdentifier(client, org.slug);
    }
  );
  return 0;
}
