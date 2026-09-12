import type Client from '../../../util/client';
import {
  handleValidationError,
  validateAllProjectMutualExclusivity,
} from '../../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import getScope from '../../../util/get-scope';
import getProjectByNameOrId from '../../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound, isAPIError } from '../../../util/errors-ts';
import {
  type AlertsScope,
  emitAlertsScopeError,
  resolveAlertsScope,
} from '../resolve-alerts-scope';

export async function resolveRulesTeam(
  client: Client,
  jsonOutput: boolean
): Promise<AlertsScope | number> {
  const { team } = await getScope(client, { resolveLocalScope: true });
  if (team) {
    return { teamId: team.id };
  }

  const message =
    'No team context found. Run `vercel switch` to select a team, use `--scope <team>`, or link a team project.';
  return emitAlertsScopeError(client, jsonOutput, 'NO_TEAM', message, {
    reason: AGENT_REASON.MISSING_SCOPE,
    hint: 'Alert rules belong to a team. Select the team before retrying.',
    next: [
      {
        command: buildCommandWithGlobalFlags(client.argv, 'teams switch'),
        when: 'Select a team',
      },
      {
        command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
        when: 'Inspect the current scope',
      },
    ],
  });
}

export async function resolveRulesProject(
  client: Client,
  projectNameOrId: string,
  jsonOutput: boolean,
  command: string
): Promise<AlertsScope | number> {
  const teamScope = await resolveRulesTeam(client, jsonOutput);
  if (typeof teamScope === 'number') {
    return teamScope;
  }

  try {
    const project = await getProjectByNameOrId(
      client,
      projectNameOrId,
      teamScope.teamId
    );
    if (project instanceof ProjectNotFound) {
      return emitAlertsScopeError(
        client,
        jsonOutput,
        'PROJECT_NOT_FOUND',
        `Project "${projectNameOrId}" was not found in the selected team.`,
        {
          reason: AGENT_REASON.NOT_FOUND,
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                `${command} --project <name_or_id>`
              ),
              when: 'Retry with a valid project',
            },
          ],
        }
      );
    }

    return {
      ...teamScope,
      projectId: project.id,
      projectName: project.name,
    };
  } catch (error) {
    if (!isAPIError(error)) {
      throw error;
    }

    return emitAlertsScopeError(
      client,
      jsonOutput,
      error.code || 'API_ERROR',
      error.serverMessage || `API error (${error.status}).`,
      {
        reason:
          error.status === 401
            ? 'not_authorized'
            : error.status === 403
              ? 'forbidden'
              : AGENT_REASON.API_ERROR,
      }
    );
  }
}

export async function parseRulesFlagsAndScope(
  client: Client,
  flags: { '--project'?: string; '--all'?: boolean },
  jsonOutput: boolean,
  command = 'alerts rules ls'
): Promise<AlertsScope | number> {
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
              'alerts rules --help'
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
    return resolveRulesTeam(client, jsonOutput);
  }
  if (flags['--project']) {
    return resolveRulesProject(client, flags['--project'], jsonOutput, command);
  }

  // A bare list intentionally retains the linked-project default. Mutating
  // commands call resolveRulesTeam directly because an item ID is team-unique.
  const linkedScope = await resolveAlertsScope(client, {
    jsonOutput,
    command,
  });
  if (typeof linkedScope === 'number') return linkedScope;

  // Resolve the team independently so an explicit global --scope takes
  // precedence over the linked project's team. A project ID is only valid
  // within its owning team, so do not combine scopes from different teams.
  const teamScope = await resolveRulesTeam(client, jsonOutput);
  if (typeof teamScope === 'number') return teamScope;
  return linkedScope.teamId === teamScope.teamId ? linkedScope : teamScope;
}

export type { AlertsScope };
