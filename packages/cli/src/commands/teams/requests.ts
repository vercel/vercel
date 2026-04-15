import type Client from '../../util/client';
import cmd from '../../util/output/cmd';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError, type APIError } from '../../util/errors-ts';
import { requestsSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import { outputAgentError } from '../../util/agent-output';
import output from '../../output-manager';

type TeamRequestMember = {
  uid: string;
  username?: string;
  email?: string;
  name?: string;
  confirmed: boolean;
  accessRequestedAt?: number;
};

type ListResponse = {
  members?: TeamRequestMember[];
};

function apiFailureReason(err: APIError): string {
  if (typeof err.code === 'string' && err.code) {
    return err.code;
  }
  if (typeof err.code === 'number' && Number.isFinite(err.code)) {
    return String(err.code);
  }
  return `http_${err.status}`;
}

function isPendingAccessRequest(member: TeamRequestMember): boolean {
  return !member.confirmed && typeof member.accessRequestedAt === 'number';
}

export default async function requests(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(requestsSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: formatResult.error,
        },
        1
      );
    }
    output.error(formatResult.error);
    return 1;
  }

  const asJson = formatResult.jsonOutput;
  const action = parsedArgs.args[0] ?? 'ls';
  const userId = parsedArgs.args[1];
  const { currentTeam: teamId } = client.config;

  if (!teamId) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'team_scope_required',
          message:
            'Team scope is required for teams requests. Run `vercel teams switch <slug>` or use --scope.',
          next: [{ command: 'vercel teams switch <slug>' }],
        },
        1
      );
    }
    output.error(
      `This command requires a team scope. Run ${cmd('teams switch')} first.`
    );
    return 1;
  }

  try {
    if (action === 'ls' || action === 'list') {
      const response = await client.fetch<ListResponse>(
        `/v2/teams/${encodeURIComponent(teamId)}/members`
      );
      const requests = (response.members ?? []).filter(isPendingAccessRequest);

      if (asJson) {
        client.stdout.write(`${JSON.stringify({ requests }, null, 2)}\n`);
        return 0;
      }

      if (requests.length === 0) {
        output.log('No pending access requests found.');
        return 0;
      }

      output.log(`Found ${requests.length} pending access request(s):`);
      for (const req of requests) {
        const id = req.uid;
        const handle = req.username ? ` @${req.username}` : '';
        const email = req.email ? ` <${req.email}>` : '';
        output.print(`- ${id}${handle}${email}`);
      }
      return 0;
    }

    if (action !== 'approve' && action !== 'reject') {
      output.error(
        'Invalid action. Use one of: ls | approve <userId> | reject <userId>'
      );
      return 2;
    }

    if (!userId) {
      output.error(
        `Missing userId. Usage: vercel teams requests ${action} <userId>`
      );
      return 2;
    }

    if (action === 'approve') {
      await client.fetch(
        `/v1/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          body: { confirmed: true },
        }
      );

      if (asJson) {
        client.stdout.write(
          `${JSON.stringify(
            { success: true, action: 'approve', teamId, userId },
            null,
            2
          )}\n`
        );
      } else {
        output.success(`Approved access request for ${userId}.`);
      }
      return 0;
    }

    const yes = Boolean(parsedArgs.flags['--yes']);
    if (!yes) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'confirmation_required',
            message:
              'Rejecting an access request requires --yes in non-interactive mode.',
            next: [{ command: `vercel teams requests reject ${userId} --yes` }],
          },
          1
        );
      }
      const confirmed = await client.input.confirm(
        `Reject pending access request for ${userId}?`,
        false
      );
      if (!confirmed) {
        output.error('Canceled');
        return 0;
      }
    }

    await client.fetch(
      `/v1/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );

    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          { success: true, action: 'reject', teamId, userId },
          null,
          2
        )}\n`
      );
    } else {
      output.success(`Rejected access request for ${userId}.`);
    }
    return 0;
  } catch (err: unknown) {
    if (client.nonInteractive && isAPIError(err)) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: apiFailureReason(err),
          message: err.serverMessage || err.message,
        },
        1
      );
    }
    printError(err);
    return 1;
  }
}
