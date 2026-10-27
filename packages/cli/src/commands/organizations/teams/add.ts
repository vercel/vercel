import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import {
  PLAN_MESSAGE,
  TEAM_ID_PREFIX,
  billingPlanSchema,
  invalidArgument,
  isPrefixedId,
  missingArgument,
  outputFormat,
  slugSchema,
  validateOptional,
} from '../../../util/organizations/args';
import { resolveOrganization } from '../../../util/organizations/resolve';
import { handleOrganizationApiError } from '../../../util/organizations/errors';
import getTeamByIdOrSlug from '../../../util/teams/get-team-by-id-or-slug';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { OrganizationsTelemetryClient } from '../../../util/telemetry/commands/organizations';
import { teamsAddSubcommand } from '../command';
import submit from './submit';

const USAGE = 'organizations teams add [organization] --child-team <team>';
const TEAM_MESSAGE =
  'Provide --child-team with the existing team ID or slug. A slug uses 1-48 lowercase letters, numbers, or hyphens.';

/** Checks the `--child-team` syntax before any request. */
function isTeamSelector(ref: string): boolean {
  if (ref.startsWith(TEAM_ID_PREFIX)) {
    return isPrefixedId(ref, TEAM_ID_PREFIX);
  }
  return slugSchema.safeParse(ref).success;
}

export default async function add(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(teamsAddSubcommand.options);
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
  telemetry.trackCliOptionChildTeam(opts['--child-team']);
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

  const childTeam = opts['--child-team'];
  if (childTeam === undefined) {
    return missingArgument(client, {
      reason: AGENT_REASON.MISSING_ARGUMENTS,
      message: 'Provide --child-team with the existing team ID or slug.',
      usage: USAGE,
    });
  }

  if (!isTeamSelector(childTeam)) {
    return invalidArgument(client, TEAM_MESSAGE);
  }

  const id = await resolveOrganization(client, args, USAGE);
  if (id.status === 'error') return id.exitCode;

  // Resolve the team before consent, so the preview names the exact team and
  // a typo fails as a missing team, not as a missing organization.
  let team: Awaited<ReturnType<typeof getTeamByIdOrSlug>>;
  try {
    team = await getTeamByIdOrSlug(client, childTeam, {
      useCurrentTeam: false,
    });
  } catch (err) {
    return handleOrganizationApiError(client, err, {
      action: `find team ${childTeam}`,
      notFound: `Couldn't find team ${childTeam}.`,
    });
  }

  return submit(client, {
    action: 'add',
    organizationId: id.value,
    body: { mode: 'link', teamId: team.id, billingPlan: plan.value },
    teamSlug: team.slug,
    jsonOutput: format.value,
    yes: opts['--yes'] ?? false,
  });
}
