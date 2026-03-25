import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import output from '../../output-manager';
import { outputAgentError, buildCommandWithYes } from '../../util/agent-output';
import { AGENT_STATUS, AGENT_REASON } from '../../util/agent-output-constants';
import { getGlobalFlagsOnlyFromArgs } from '../../util/arg-common';
import type { Command } from '../help';

export interface ParsedSubcommand {
  args: string[];
  flags: { [key: string]: any };
}

/**
 * Plain suggested command with global flags from argv (--cwd, --non-interactive, etc.).
 */
export function withGlobalFlags(
  client: Client,
  commandTemplate: string
): string {
  const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
  return getCommandNamePlain(`${commandTemplate} ${flags.join(' ')}`.trim());
}

export async function parseSubcommandArgs(
  argv: string[],
  command: Command,
  client?: Client
): Promise<ParsedSubcommand | number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(command.options);

  try {
    // @ts-expect-error - TypeScript complains about the flags specification type
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    if (client?.nonInteractive) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: rawMessage,
          next: [
            {
              command: getCommandNamePlain(
                `firewall ${command.name} ${flags.join(' ')}`.trim()
              ),
              when: 'fix flags and retry',
            },
          ],
        },
        1
      );
      return 1;
    }
    printError(err);
    return 1;
  }

  return parsedArgs;
}

export async function ensureProjectLink(client: Client) {
  const link = await getLinkedProject(client);

  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
      const cmd = getCommandNamePlain(`link ${flags.join(' ')}`.trim());
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.NOT_LINKED,
          userActionRequired: true,
          message:
            'Your codebase is not linked to a Vercel project. Run link first, then retry firewall commands.',
          next: [
            {
              command: cmd,
              when: 'to link this directory to a project',
            },
          ],
        },
        1
      );
      return 1;
    }
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  return link;
}

export async function confirmAction(
  client: Client,
  skipConfirmation: boolean,
  message: string,
  details?: string
): Promise<boolean> {
  if (skipConfirmation) return true;

  if (client.nonInteractive) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.CONFIRMATION_REQUIRED,
      message: `${message} Re-run with --yes to confirm.`,
      next: [
        {
          command: buildCommandWithYes(client.argv),
          when: 're-run with --yes to confirm',
        },
      ],
    });
    process.exit(1);
    return false;
  }

  if (details) {
    output.print(`  ${details}\n\n`);
  }

  return client.input.confirm(message, false);
}

export function outputJson(client: Client, data: unknown): void {
  output.stopSpinner();
  client.stdout.write(JSON.stringify(data, null, 2) + '\n');
}
