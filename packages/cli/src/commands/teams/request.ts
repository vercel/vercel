import type Client from '../../util/client';
import cmd from '../../util/output/cmd';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError, type APIError } from '../../util/errors-ts';
import { requestSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import { outputAgentError } from '../../util/agent-output';
import { getCommandNamePlain } from '../../util/pkg-name';
import {
  getGlobalFlagsOnlyFromArgs,
  getSameSubcommandSuggestionFlags,
  getCommandNameWithGlobalFlags,
} from '../../util/arg-common';
import output from '../../output-manager';

/** Append global argv flags (--cwd, --non-interactive, etc.) so agents can re-run with same context. */
function withGlobalFlags(client: Client, commandTemplate: string): string {
  const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
  return getCommandNamePlain(`${commandTemplate} ${flags.join(' ')}`.trim());
}

function optionRoot(flagToken: string): string {
  if (flagToken.startsWith('--')) {
    return flagToken.includes('=')
      ? `--${flagToken.slice(2).split('=')[0]}`
      : flagToken;
  }
  return flagToken;
}

/**
 * Suggested `teams request` retry: global flags from anywhere in argv (e.g. `vercel --cwd x teams …`)
 * plus subcommand flags after `request` / `access-request`, without duplicating options.
 */
function teamsRequestNextCommand(client: Client): string {
  const fullArgs = client.argv.slice(2);
  const reqIdx = fullArgs.findIndex(
    a => a === 'request' || a === 'access-request'
  );
  const afterRequest = reqIdx >= 0 ? fullArgs.slice(reqIdx + 1) : [];
  const globalParts = getGlobalFlagsOnlyFromArgs(fullArgs);
  const subParts = getSameSubcommandSuggestionFlags(afterRequest);

  const seen = new Set<string>();
  for (const g of globalParts) {
    seen.add(optionRoot(g));
  }

  const extras: string[] = [];
  for (let i = 0; i < subParts.length; ) {
    const a = subParts[i];
    const root = optionRoot(a);
    if (seen.has(root)) {
      i += 1;
      if (
        !a.includes('=') &&
        i < subParts.length &&
        !subParts[i].startsWith('-')
      ) {
        i += 1;
      }
      continue;
    }
    seen.add(root);
    extras.push(a);
    i += 1;
    if (
      !a.includes('=') &&
      i < subParts.length &&
      !subParts[i].startsWith('-')
    ) {
      extras.push(subParts[i]);
      i += 1;
    }
  }

  const base = getCommandNameWithGlobalFlags(
    'teams request [userId]',
    client.argv
  );
  if (extras.length === 0) {
    return base;
  }
  return getCommandNamePlain(`${base} ${extras.join(' ')}`.trim());
}

function apiFailureReason(err: APIError): string {
  if (typeof err.code === 'string' && err.code) {
    return err.code;
  }
  if (typeof err.code === 'number' && Number.isFinite(err.code)) {
    return String(err.code);
  }
  return `http_${err.status}`;
}

export default async function request(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(requestSubcommand.options);
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

  if (parsedArgs.args.length > 1) {
    if (client.nonInteractive) {
      const cmdStr = teamsRequestNextCommand(client);
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message:
            'Invalid number of arguments. At most one optional userId is allowed.',
          next: [
            {
              command: cmdStr,
              when: 'to check join-request status (omit userId for the current user)',
            },
          ],
        },
        1
      );
    }
    output.error(
      'Invalid number of arguments. Usage: `vercel teams request [userId]`'
    );
    return 2;
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

  const { currentTeam: teamId } = client.config;
  if (!teamId) {
    const switchCmd = withGlobalFlags(client, 'teams switch <slug>');
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'team_scope_required',
          message: `Team scope is required for teams request. Run ${switchCmd} or use --scope.`,
          next: [
            {
              command: switchCmd,
              when: 'to select a team scope (replace <slug> with your team slug)',
            },
          ],
        },
        1
      );
    }
    output.error(
      `This command requires a team scope. Run ${cmd('teams switch')} first.`
    );
    return 1;
  }

  const userId = parsedArgs.args[0];
  const path = userId
    ? `/v1/teams/${encodeURIComponent(teamId)}/request/${encodeURIComponent(userId)}`
    : `/v1/teams/${encodeURIComponent(teamId)}/request`;

  let data: Record<string, unknown>;
  try {
    data = await client.fetch<Record<string, unknown>>(path);
  } catch (err: unknown) {
    if (client.nonInteractive && isAPIError(err)) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: apiFailureReason(err),
          message: err.serverMessage || err.message,
          next: [
            {
              command: teamsRequestNextCommand(client),
              when: 'to retry after resolving the error (same flags and optional userId)',
            },
          ],
        },
        1
      );
    }
    printError(err);
    return 1;
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return 0;
  }

  output.log(
    `Team: ${String(data.teamName ?? '')} (${String(data.teamSlug ?? '')})`
  );
  output.log(`Confirmed: ${String(data.confirmed ?? '')}`);
  if (data.accessRequestedAt != null) {
    output.log(`Access requested at: ${String(data.accessRequestedAt)}`);
  }
  if (data.joinedFrom && typeof data.joinedFrom === 'object') {
    output.log(`Joined from: ${JSON.stringify(data.joinedFrom)}`);
  }
  return 0;
}
