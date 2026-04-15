import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { transferSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import getScope from '../../util/get-scope';
import { getLinkedProject } from '../../util/projects/link';
import { outputAgentError } from '../../util/agent-output';

type TransferAction = 'request' | 'accept' | 'preflight';

function ensureTeamId(client: Client, teamId?: string): string | undefined {
  if (teamId) return teamId;
  if (client.config.currentTeam) return client.config.currentTeam;
  return undefined;
}

export default async function transfer(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(transferSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const action = parsedArgs.args[0] as TransferAction | undefined;
  const value = parsedArgs.args[1];
  if (!action || !['request', 'accept', 'preflight'].includes(action)) {
    output.error(
      `Invalid action. Usage: ${chalk.cyan('vercel project transfer request [project]')} | ${chalk.cyan('vercel project transfer accept <code> --yes')} | ${chalk.cyan('vercel project transfer preflight <code>')}`
    );
    return 2;
  }

  const scope = await getScope(client);
  const teamId = ensureTeamId(client, scope.team?.id);
  if (!teamId) {
    output.error('A team scope is required. Run `vercel teams switch <slug>`.');
    return 1;
  }

  try {
    if (action === 'request') {
      let projectIdOrName = value;
      if (!projectIdOrName) {
        const linked = await getLinkedProject(client);
        if (linked.status !== 'linked') {
          output.error(
            'No project provided and no linked project found. Pass a project name/id or run `vercel link`.'
          );
          return 1;
        }
        projectIdOrName = linked.project.id;
      }

      const callbackUrl = parsedArgs.flags['--callback-url'] as
        | string
        | undefined;
      const body = callbackUrl ? { callbackUrl } : {};
      const response = await client.fetch<{ code: string }>(
        `/v1/projects/${encodeURIComponent(projectIdOrName)}/transfer-request`,
        { method: 'POST', body, json: true }
      );

      if (asJson) {
        client.stdout.write(
          `${JSON.stringify(
            { action, projectIdOrName, code: response.code },
            null,
            2
          )}\n`
        );
      } else {
        output.success('Project transfer request created.');
        output.log(`Transfer code: ${chalk.bold(response.code)}`);
      }
      return 0;
    }

    const code = value;
    if (!code) {
      output.error(`Missing transfer code for action "${action}".`);
      return 2;
    }

    if (action === 'accept') {
      const yes = Boolean(parsedArgs.flags['--yes']);
      if (!yes) {
        if (client.nonInteractive) {
          outputAgentError(
            client,
            {
              status: 'error',
              reason: 'confirmation_required',
              message:
                'Accepting a project transfer requires --yes in non-interactive mode.',
            },
            1
          );
          return 1;
        }
        const confirmed = await client.input.confirm(
          `Accept project transfer request ${code}?`,
          false
        );
        if (!confirmed) {
          output.error('Canceled');
          return 0;
        }
      }

      const response = await client.fetch<Record<string, unknown>>(
        `/v1/projects/transfer-request/${encodeURIComponent(code)}`,
        { method: 'PUT', body: {}, json: true }
      );
      if (asJson) {
        client.stdout.write(
          `${JSON.stringify({ action, code, response }, null, 2)}\n`
        );
      } else {
        output.success('Project transfer request accepted.');
      }
      return 0;
    }

    const response = await client.fetch<Record<string, unknown>>(
      `/v1/projects/transfer-request/${encodeURIComponent(code)}/preflight`,
      { method: 'GET' }
    );
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify({ action, code, response }, null, 2)}\n`
      );
    } else {
      output.success('Transfer preflight completed.');
      client.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    }
    return 0;
  } catch (error) {
    printError(error);
    return 1;
  }
}
