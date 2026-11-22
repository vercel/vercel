import type Client from '../../../util/client';
import { addOrganizationTeam } from '../../../util/organizations/api';
import { handleOrganizationApiError } from '../../../util/organizations/errors';
import { printAlignedLabel } from '../../../util/output/print-aligned-label';
import {
  buildCommandWithYes,
  outputActionRequired,
  shouldEmitNonInteractiveCommandError,
} from '../../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
  getExitCodeForReason,
} from '../../../util/agent-output-constants';
import { canPromptForCharge } from '../../../util/domains/domain-charge';
import output from '../../../output-manager';
import { printResult, printStdoutIdentifier, progress } from '../output';

/** One team operation, with everything resolved before consent. */
export interface TeamSubmission {
  /** `create` makes a new child team; `add` moves an existing team. */
  action: 'create' | 'add';
  organizationId: string;
  body: Parameters<typeof addOrganizationTeam>[2];
  /** The team slug, for the preview, the receipt, and stdout. */
  teamSlug: string;
  jsonOutput: boolean;
  /** `--yes`: consent to the billing change without a prompt. */
  yes: boolean;
}

/**
 * Sends both team operations. They share one endpoint, and both change who
 * pays for the team, so they share the preview, the consent, and the result
 * rendering. The CLI design system rates a billing change as destructive:
 * preview, `(y/N)`, and `--yes` when a prompt isn't possible.
 */
export default async function submit(
  client: Client,
  submission: TeamSubmission
): Promise<number> {
  const { action, organizationId, body, teamSlug, jsonOutput } = submission;
  const effect = billingEffect(submission);

  if (!jsonOutput) {
    printAlignedLabel('Organization', organizationId);
    printAlignedLabel('Team', teamSlug);
    printAlignedLabel(
      'Billing Plan',
      body.billingPlan ??
        (action === 'create' ? 'platform' : "Derived from the team's plan")
    );
    output.print('\n');
    output.print(`  ${effect}\n`);
  }

  if (!submission.yes) {
    const consent = await askForConsent(client, submission, effect);
    if (consent !== undefined) {
      return consent;
    }
  }

  progress(
    jsonOutput,
    action === 'create'
      ? 'Creating organization team…'
      : 'Adding team to organization…'
  );

  let result: Awaited<ReturnType<typeof addOrganizationTeam>>;
  try {
    result = await addOrganizationTeam(client, organizationId, body);
  } catch (err) {
    output.stopSpinner();
    return handleOrganizationApiError(client, err, {
      action:
        action === 'create'
          ? `create team ${teamSlug} in organization ${organizationId}`
          : `add team ${teamSlug} to organization ${organizationId}`,
      notFound: `Couldn't find organization ${organizationId}.`,
    });
  }

  printResult(
    client,
    jsonOutput,
    { team: result, outcome: action === 'create' ? 'created' : 'added' },
    () => {
      output.print('\n');
      printAlignedLabel(action === 'create' ? 'Created' : 'Added', teamSlug, {
        gutter: '✓',
      });
      printAlignedLabel('Team ID', result.teamId);
      printAlignedLabel('Organization', result.organizationId);
      if (result.billingPlan) {
        printAlignedLabel('Billing Plan', result.billingPlan);
      }

      // Adding an existing team answers 202: the link exists, and a
      // background job then stamps the team's projects with the
      // organization ID. A new team has no projects to move.
      if (action === 'add') {
        output.print(
          `  Projects in team ${teamSlug} move to the organization in the background.\n`
        );
      }

      printStdoutIdentifier(client, teamSlug);
    }
  );
  return 0;
}

/** The billing consequence of the operation, as one sentence. */
function billingEffect({ action, body, teamSlug }: TeamSubmission): string {
  if (action === 'add') {
    return `Moves billing for team ${teamSlug} to the organization's root team.`;
  }

  const billedOn =
    body.billingPlan === 'enterprise'
      ? "on the root team's Enterprise subscription"
      : "through the organization's root team";
  return `Creates team ${teamSlug}. Its usage is billed ${billedOn}.`;
}

/**
 * Asks for consent, or reports that `--yes` is required when no prompt is
 * possible. Returns the exit code when the command must stop, or undefined
 * when the person approved.
 */
async function askForConsent(
  client: Client,
  { action, organizationId, teamSlug, jsonOutput }: TeamSubmission,
  effect: string
): Promise<number | undefined> {
  // `--non-interactive` on argv also blocks the prompt, as it does for the
  // shared agent output.
  const canPrompt =
    canPromptForCharge(client, jsonOutput) &&
    !shouldEmitNonInteractiveCommandError(client);
  if (!canPrompt) {
    const message = `Can't ${action} team ${teamSlug} without --yes in non-interactive mode.`;
    const command = buildCommandWithYes(client.argv);
    const reason = AGENT_REASON.CONFIRMATION_REQUIRED;

    outputActionRequired(client, {
      status: AGENT_STATUS.ACTION_REQUIRED,
      reason,
      action: AGENT_ACTION.CONFIRMATION_REQUIRED,
      message,
      userActionRequired: true,
      // `effects` stays a list in the JSON contract.
      data: { organizationId, team: teamSlug, effects: [effect] },
      next: [{ command, when: `Only after a human approves: ${effect}` }],
    });
    output.error(message);
    output.print(
      `\n  After a person approves the billing change, run:\n    ${command}\n`
    );
    return getExitCodeForReason(reason);
  }

  const question =
    action === 'create'
      ? `Create team ${teamSlug} billed through organization ${organizationId}?`
      : `Add team ${teamSlug} to organization ${organizationId} and move its billing?`;

  if (await client.input.confirm(question, false)) {
    return undefined;
  }

  output.print('  Canceled.\n  Nothing was changed.\n');
  return 130;
}
