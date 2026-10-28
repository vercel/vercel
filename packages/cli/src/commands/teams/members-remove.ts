import type Client from '../../util/client';
import { formatOption, jsonOption } from '../../util/arg-common';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  type ActionRequiredPayload,
  buildCommandWithGlobalFlags,
  outputActionRequired,
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
  getExitCodeForReason,
} from '../../util/agent-output-constants';
import { canPrompt } from '../../util/can-prompt';
import { email as emailRegex } from '../../util/input/regexes';
import { validateJsonOutput } from '../../util/output-format';
import {
  getTeamMemberByIdentifier,
  teamMemberLabel,
  type TeamMember,
} from '../../util/teams/get-team-member';
import getTeamByIdOrSlug from '../../util/teams/get-team-by-id-or-slug';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import output from '../../output-manager';

function teamMemberPreviewLabel(member: TeamMember): string {
  if (member.username && member.email) {
    return `${member.username} (${member.email})`;
  }
  return teamMemberLabel(member);
}

function matchesEmail(first: string | undefined, second: string | undefined) {
  return Boolean(
    first &&
      second &&
      first.trim().toLowerCase() === second.trim().toLowerCase()
  );
}

function invoiceRecipientError(
  invoiceRecipient: string,
  departingMember: TeamMember,
  currentInvoiceRecipient: string
): string | undefined {
  if (!emailRegex.test(invoiceRecipient)) {
    return 'Enter a valid invoice recipient email address.';
  }
  if (
    matchesEmail(invoiceRecipient, departingMember.email) ||
    matchesEmail(invoiceRecipient, currentInvoiceRecipient)
  ) {
    return 'Choose a different invoice recipient. That address belongs to the team member being removed.';
  }
  return undefined;
}

function buildInteractiveRemoveCommand(client: Client): string {
  return buildCommandWithGlobalFlags(
    client.argv,
    'teams members remove <member>',
    undefined,
    { excludeFlags: ['--non-interactive'] }
  );
}

export async function membersRemove(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification([formatOption, jsonOption])
    );
  } catch (error) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: error instanceof Error ? error.message : String(error),
    });
    printError(error);
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const { jsonOutput } = formatResult;

  function fail(
    reason: string,
    message: string,
    extra?: Record<string, unknown>
  ): number {
    if (shouldEmitNonInteractiveCommandError(client)) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason,
        message,
        ...extra,
      });
      return getExitCodeForReason(reason);
    }
    if (jsonOutput || !canPrompt(client)) {
      client.stdout.write(
        `${JSON.stringify(
          { status: AGENT_STATUS.ERROR, reason, message },
          null,
          2
        )}\n`
      );
      return getExitCodeForReason(reason);
    }
    output.fatal(message);
    return getExitCodeForReason(reason);
  }

  if (parsedArgs.args.length !== 1) {
    return fail(
      AGENT_REASON.INVALID_ARGUMENTS,
      'Provide exactly 1 team member. Usage: `vercel teams members remove <member>`',
      {
        next: [
          {
            command: buildInteractiveRemoveCommand(client),
            when: 'Remove a member from the currently scoped team',
          },
        ],
      }
    );
  }

  const teamId = await client.resolveCurrentTeam();
  if (!teamId) {
    return fail(
      'team_scope_required',
      'Select a team. Run `vercel teams switch <slug>` or pass `--scope`.',
      {
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'teams switch <slug>'
            ),
            when: 'Select the team containing the member',
          },
        ],
      }
    );
  }

  const identifier = parsedArgs.args[0];
  let team: Awaited<ReturnType<typeof getTeamByIdOrSlug>>;
  let member: TeamMember | null;
  try {
    [team, member] = await Promise.all([
      getTeamByIdOrSlug(client, teamId),
      getTeamMemberByIdentifier(client, teamId, identifier),
    ]);
  } catch {
    return fail(
      AGENT_REASON.API_ERROR,
      'Failed to resolve the team member. Try again.'
    );
  }

  if (!member) {
    const listCommand = buildCommandWithGlobalFlags(
      client.argv,
      'teams members'
    );
    return fail(
      AGENT_REASON.NOT_FOUND,
      `Couldn't find that team member. Run \`${listCommand}\` to list current members.`,
      {
        next: [
          {
            command: listCommand,
            when: 'List current members to find the right identifier',
          },
        ],
      }
    );
  }

  const label = teamMemberPreviewLabel(member);
  const teamLabel = `${team.name} (${team.slug})`;
  const currentInvoiceRecipient = team.billing?.email;
  const requiresInvoiceRecipient = matchesEmail(
    currentInvoiceRecipient,
    member.email
  );
  let invoiceRecipient: string | undefined;

  if (requiresInvoiceRecipient && currentInvoiceRecipient) {
    if (!canPrompt(client)) {
      const actionRequired: ActionRequiredPayload = {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.MISSING_REQUIREMENTS,
        action: AGENT_ACTION.MISSING_ARGUMENTS,
        userActionRequired: true,
        message:
          'Invoices currently go to this team member. Rerun this command in an interactive terminal to choose where future invoices are sent.',
        hint: 'Run this command in an interactive terminal to choose a new invoice recipient.',
        missing: ['interactive_terminal'],
        data: {
          team: { id: team.id, name: team.name, slug: team.slug },
          member: {
            uid: member.uid,
            email: member.email,
            username: member.username,
          },
          invoiceRecipient: currentInvoiceRecipient,
        },
        next: [
          {
            command: buildInteractiveRemoveCommand(client),
            when: 'A user reruns this command in an interactive terminal',
          },
        ],
      };
      outputActionRequired(client, actionRequired, 1);
      client.stdout.write(`${JSON.stringify(actionRequired, null, 2)}\n`);
      return 1;
    }

    output.print('\n');
    output.print(
      `Invoices currently go to ${currentInvoiceRecipient}. Future invoices will be sent to:`
    );
    invoiceRecipient = (
      await client.input.text({
        message: 'New invoice recipient?',
        validate: value =>
          !invoiceRecipientError(value.trim(), member, currentInvoiceRecipient),
      })
    ).trim();

    const error = invoiceRecipientError(
      invoiceRecipient,
      member,
      currentInvoiceRecipient
    );
    if (error) {
      return fail(AGENT_REASON.INVALID_ARGUMENTS, error);
    }
  }

  if (!canPrompt(client)) {
    const actionRequired: ActionRequiredPayload = {
      status: AGENT_STATUS.ACTION_REQUIRED,
      reason: AGENT_REASON.CONFIRMATION_REQUIRED,
      action: AGENT_ACTION.CONFIRMATION_REQUIRED,
      userActionRequired: true,
      message:
        'To remove this team member, rerun the command in an interactive terminal and confirm the prompt. No team member was removed.',
      hint: 'Run this command in an interactive terminal to review and confirm removal.',
      data: {
        team: { id: team.id, name: team.name, slug: team.slug },
        member: {
          uid: member.uid,
          email: member.email,
          username: member.username,
        },
      },
      next: [
        {
          command: buildInteractiveRemoveCommand(client),
          when: 'A user runs this command in an interactive terminal',
        },
      ],
    };
    outputActionRequired(client, actionRequired, 1);
    client.stdout.write(`${JSON.stringify(actionRequired, null, 2)}\n`);
    return 1;
  }

  output.print('\n');
  printAlignedLabel('Team', teamLabel);
  printAlignedLabel('Member', label);
  if (requiresInvoiceRecipient && invoiceRecipient && currentInvoiceRecipient) {
    printAlignedLabel('Invoice To', currentInvoiceRecipient);
    printAlignedLabel('New Recipient', invoiceRecipient);
  }
  output.print('\n');

  const confirmed = await client.input.confirm(
    requiresInvoiceRecipient
      ? 'Update the invoice recipient and remove this team member?'
      : 'Remove this team member?',
    false
  );
  if (!confirmed) {
    output.log('Canceled.');
    return 0;
  }

  if (requiresInvoiceRecipient && invoiceRecipient && currentInvoiceRecipient) {
    try {
      await client.fetch(
        `/stripe/invoices/settings?${new URLSearchParams({ teamId }).toString()}`,
        { method: 'PATCH', body: { email: invoiceRecipient } }
      );
      printAlignedLabel('Updated', 'Invoice recipient', { gutter: '✓' });
    } catch {
      return fail(
        AGENT_REASON.API_ERROR,
        "Couldn't update the invoice recipient. Check your billing permissions or try again."
      );
    }
  }

  try {
    const result = await client.fetch<Record<string, unknown>>(
      `/v2/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(member.uid)}`,
      { method: 'DELETE' }
    );
    if (jsonOutput) {
      client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }
    printAlignedLabel('Removed', label, { gutter: '✓' });
    printAlignedLabel('Team', teamLabel);
    return 0;
  } catch {
    return fail(
      AGENT_REASON.API_ERROR,
      requiresInvoiceRecipient
        ? 'Invoice recipient updated, but the team member was not removed. Try removing them again.'
        : 'Failed to remove the team member. Try again.'
    );
  }
}
