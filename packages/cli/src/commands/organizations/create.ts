import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { createOrganization } from '../../util/organizations/api';
import { handleOrganizationApiError } from '../../util/organizations/errors';
import {
  NAME_MESSAGE,
  SLUG_MESSAGE,
  nameSchema,
  noArguments,
  outputFormat,
  slugSchema,
  validate,
  validateOptional,
} from '../../util/organizations/args';
import { resolveRootTeamId } from '../../util/organizations/resolve';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { OrganizationsTelemetryClient } from '../../util/telemetry/commands/organizations';
import output from '../../output-manager';
import { createSubcommand } from './command';
import {
  printOrganization,
  printResult,
  printStdoutIdentifier,
  progress,
} from './output';

const USAGE = 'organizations create --slug <slug>';

export default async function create(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(createSubcommand.options);
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
  telemetry.trackCliOptionSlug(opts['--slug']);
  telemetry.trackCliOptionName(opts['--name']);

  const format = outputFormat(client, opts);
  if (format.status === 'error') return format.exitCode;

  const empty = noArguments(client, args, USAGE);
  if (empty.status === 'error') return empty.exitCode;

  const slug = validate(client, slugSchema, opts['--slug'], {
    message: SLUG_MESSAGE,
    usage: USAGE,
  });
  if (slug.status === 'error') return slug.exitCode;

  const name = validateOptional(
    client,
    nameSchema,
    opts['--name'],
    NAME_MESSAGE
  );
  if (name.status === 'error') return name.exitCode;

  // The root team is the active team, which `--scope` selects like it does for
  // every other team-scoped command.
  const rootTeamId = await resolveRootTeamId(client, USAGE);
  if (rootTeamId.status === 'error') return rootTeamId.exitCode;

  if (!format.value) {
    printAlignedLabel('Root Team', rootTeamId.value);
    printAlignedLabel('Organization', slug.value);
  }

  progress(format.value, 'Creating organization…');
  let org: Awaited<ReturnType<typeof createOrganization>>;
  try {
    org = await createOrganization(client, rootTeamId.value, {
      slug: slug.value,
      name: name.value,
    });
  } catch (err) {
    output.stopSpinner();
    return handleOrganizationApiError(client, err, {
      action: `create organization ${slug.value}`,
      // The API gates creation per team and answers 404 while it is off, so a
      // 404 here does not prove that the team is missing.
      notFound: `Can't create an organization from team ${rootTeamId.value}. Organization creation isn't enabled for this team, or the team doesn't exist.`,
    });
  }

  printResult(
    client,
    format.value,
    { organization: org, outcome: 'created' },
    () => {
      printOrganization(client, org, { action: 'Created' });
      // The API answers 202: the organization exists, and a background job
      // then stamps the root team's projects with the organization ID.
      output.print(
        "  The root team's projects move to the organization in the background.\n"
      );
      printStdoutIdentifier(client, org.slug);
    }
  );
  return 0;
}
