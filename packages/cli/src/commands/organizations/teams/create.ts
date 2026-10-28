import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import {
  NAME_MESSAGE,
  PLAN_MESSAGE,
  SLUG_MESSAGE,
  billingPlanSchema,
  nameSchema,
  outputFormat,
  slugSchema,
  validate,
  validateOptional,
} from '../../../util/organizations/args';
import { resolveOrganization } from '../../../util/organizations/resolve';
import { OrganizationsTelemetryClient } from '../../../util/telemetry/commands/organizations';
import { teamsCreateSubcommand } from '../command';
import submit from './submit';

const USAGE =
  'organizations teams create [organization] --slug <slug> --name <name>';

export default async function create(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    teamsCreateSubcommand.options
  );
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
  telemetry.trackCliOptionName(opts['--name']);
  telemetry.trackCliOptionBillingPlan(opts['--billing-plan']);
  telemetry.trackCliFlagYes(opts['--yes']);

  const format = outputFormat(client, opts);
  if (format.status === 'error') return format.exitCode;

  const plan = validateOptional(
    client,
    billingPlanSchema,
    opts['--billing-plan'],
    PLAN_MESSAGE
  );
  if (plan.status === 'error') return plan.exitCode;

  const slug = validate(client, slugSchema, opts['--slug'], {
    message: SLUG_MESSAGE,
    usage: USAGE,
  });
  if (slug.status === 'error') return slug.exitCode;

  const name = validate(client, nameSchema, opts['--name'], {
    message: NAME_MESSAGE,
    usage: USAGE,
  });
  if (name.status === 'error') return name.exitCode;

  const id = await resolveOrganization(client, args, USAGE);
  if (id.status === 'error') return id.exitCode;

  return submit(client, {
    action: 'create',
    organizationId: id.value,
    body: {
      mode: 'create',
      slug: slug.value,
      name: name.value,
      billingPlan: plan.value,
    },
    teamSlug: slug.value,
    jsonOutput: format.value,
    yes: opts['--yes'] ?? false,
  });
}
