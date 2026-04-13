import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { inspectSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import getScope from '../../util/get-scope';
import { getLinkedProject } from '../../util/projects/link';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { isAPIError, ProjectNotFound } from '../../util/errors-ts';
import {
  outputError,
  handleValidationError,
  validateAllProjectMutualExclusivity,
} from '../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { packageName } from '../../util/pkg-name';
import { emitAlertsScopeError } from './resolve-alerts-scope';
import chalk from 'chalk';

type AlertScope = { teamId: string; projectId?: string };

async function resolveInspectScope(
  client: Client,
  flags: {
    '--project'?: string;
    '--all'?: boolean;
  },
  jsonOutput: boolean
): Promise<AlertScope | number> {
  const mutual = validateAllProjectMutualExclusivity(
    flags['--all'],
    flags['--project']
  );
  if (!mutual.valid) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: mutual.message,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'alerts inspect <groupId> --help'
            ),
            when: 'Use either `--project` or `--all`, not both',
          },
        ],
      },
      1
    );
    return handleValidationError(mutual, jsonOutput, client);
  }

  if (flags['--all']) {
    const { team } = await getScope(client);
    if (!team) {
      const msg =
        'No team context found. Run `vercel switch` to select a team, or use `vercel link`.';
      return emitAlertsScopeError(client, jsonOutput, 'NO_TEAM', msg, {
        reason: AGENT_REASON.MISSING_SCOPE,
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
            when: 'See current user and team',
          },
          {
            command: buildCommandWithGlobalFlags(client.argv, 'teams switch'),
            when: 'Switch to a team that owns the project',
          },
        ],
      });
    }
    return { teamId: team.id };
  }

  if (flags['--project']) {
    const { team } = await getScope(client);
    if (!team) {
      const msg =
        'No team context found. Run `vercel switch` to select a team.';
      return emitAlertsScopeError(client, jsonOutput, 'NO_TEAM', msg, {
        reason: AGENT_REASON.MISSING_SCOPE,
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
            when: 'See current user and team',
          },
          {
            command: buildCommandWithGlobalFlags(client.argv, 'teams switch'),
            when: 'Switch to a team that owns the project',
          },
        ],
      });
    }
    try {
      const p = await getProjectByNameOrId(client, flags['--project'], team.id);
      if (p instanceof ProjectNotFound) {
        const msg = `Project "${flags['--project']}" was not found.`;
        return emitAlertsScopeError(
          client,
          jsonOutput,
          'PROJECT_NOT_FOUND',
          msg,
          {
            reason: AGENT_REASON.NOT_FOUND,
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'alerts inspect <groupId> --project <name_or_id>'
                ),
                when: 'Retry with a valid project (replace placeholders)',
              },
            ],
          }
        );
      }
      return { teamId: team.id, projectId: p.id };
    } catch (err) {
      if (isAPIError(err)) {
        const msg =
          err.serverMessage ||
          (err.status === 403
            ? `You do not have permission to access project "${flags['--project']}" in team "${team.slug}".`
            : `API error (${err.status}).`);
        const reason =
          err.status === 401
            ? 'not_authorized'
            : err.status === 403
              ? 'forbidden'
              : AGENT_REASON.API_ERROR;
        return emitAlertsScopeError(
          client,
          jsonOutput,
          err.code || 'API_ERROR',
          msg,
          {
            reason,
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'alerts inspect <groupId> --project <name_or_id>'
                ),
                when: 'Retry with a project you can access',
              },
            ],
          }
        );
      }
      throw err;
    }
  }

  const linked = await getLinkedProject(client);
  if (linked.status === 'error') {
    return linked.exitCode;
  }
  if (linked.status === 'not_linked') {
    const msg =
      'No linked project. Run `vercel link` or pass --project <name> or --all.';
    return emitAlertsScopeError(client, jsonOutput, 'NOT_LINKED', msg, {
      reason: AGENT_REASON.NOT_LINKED,
      next: [
        {
          command: buildCommandWithGlobalFlags(client.argv, 'link'),
          when: 'Link this directory to a Vercel project',
        },
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'alerts inspect <groupId> --project <name_or_id>'
          ),
          when: 'Inspect using an explicit project',
        },
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'alerts inspect <groupId> --all'
          ),
          when: 'Inspect using team-wide scope',
        },
      ],
    });
  }
  return {
    teamId: linked.org.id,
    projectId: linked.project.id,
  };
}

export default async function inspect(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const spec = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, spec);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const projectFlagMissingArg =
      msg.includes('--project') && msg.includes('requires argument');
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: projectFlagMissingArg
          ? '`--project` requires a project name or id (for example `--project my-app`).'
          : msg,
        next: projectFlagMissingArg
          ? [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'alerts inspect <groupId> --project <name-or-id>'
                ),
                when: 'Re-run with placeholders replaced',
              },
            ]
          : [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'alerts inspect --help'
                ),
                when: 'See valid `alerts inspect` usage',
              },
            ],
      },
      1
    );
    printError(e);
    return 1;
  }

  const groupId = parsedArgs.args[0];
  const fr = validateJsonOutput(parsedArgs.flags);
  if (!fr.valid) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: fr.error,
      },
      1
    );
    output.error(fr.error);
    return 1;
  }

  if (!groupId) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: `Missing group id. Example: ${packageName} alerts inspect <groupId>`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'alerts inspect <groupId>'
            ),
            when: 'Replace <groupId> with a group id from `vercel alerts`',
          },
        ],
      },
      1
    );
    return outputError(
      client,
      fr.jsonOutput,
      'MISSING_ARGUMENTS',
      'Usage: `vercel alerts inspect <groupId>`'
    );
  }

  const scope = await resolveInspectScope(
    client,
    {
      '--project': parsedArgs.flags['--project'] as string | undefined,
      '--all': parsedArgs.flags['--all'] as boolean | undefined,
    },
    fr.jsonOutput
  );
  if (typeof scope === 'number') {
    return scope;
  }

  const query = new URLSearchParams({ teamId: scope.teamId });
  if (scope.projectId) {
    query.set('projectId', scope.projectId);
  }

  const path = `/alerts/v3/groups/${encodeURIComponent(groupId)}?${query.toString()}`;
  output.spinner('Fetching alert group...');
  try {
    const group = await client.fetch<Record<string, unknown>>(path);
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify({ group }, null, 2)}\n`);
    } else {
      output.log(`${chalk.bold('Alert group')} ${chalk.cyan(groupId)}`);
      client.stdout.write(`${JSON.stringify(group, null, 2)}\n`);
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      const msg = err.serverMessage || `API error (${err.status}).`;
      const reason =
        err.status === 401
          ? 'not_authorized'
          : err.status === 403
            ? 'forbidden'
            : err.status === 404
              ? AGENT_REASON.NOT_FOUND
              : err.status === 429
                ? 'rate_limited'
                : AGENT_REASON.API_ERROR;
      outputAgentError(
        client,
        {
          status: 'error',
          reason,
          message: msg,
          ...(err.status === 401 || err.status === 403
            ? {
                hint: 'Confirm team scope; use --scope <team-slug> if the group belongs to another team.',
                next: [
                  {
                    command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
                    when: 'See current user and team',
                  },
                  {
                    command: buildCommandWithGlobalFlags(
                      client.argv,
                      `alerts inspect ${groupId}`
                    ),
                    when: 'Retry after fixing scope or permissions',
                  },
                ],
              }
            : {}),
        },
        1
      );
      return outputError(client, fr.jsonOutput, err.code || 'API_ERROR', msg);
    }
    throw err;
  } finally {
    output.stopSpinner();
  }
}
