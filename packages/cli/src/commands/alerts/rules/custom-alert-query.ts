import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../../util/client';
import { isJSONObject } from '../../../util/client';
import { outputAgentError } from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import output from '../../../output-manager';
import getProjectByNameOrId from '../../../util/projects/get-project-by-id-or-name';
import { isAPIError, ProjectNotFound } from '../../../util/errors-ts';
import type { AlertsScope } from '../resolve-alerts-scope';

export interface ParsedCustomAlertQuery {
  customAlert: JSONObject;
  query: JSONObject;
}

export async function resolveCustomAlertProjectName(
  client: Client,
  scope: AlertsScope,
  projectId: string
): Promise<string | undefined> {
  if (scope.projectId === projectId && scope.projectName) {
    return scope.projectName;
  }

  try {
    const project = await getProjectByNameOrId(client, projectId, scope.teamId);
    return project instanceof ProjectNotFound ? undefined : project.name;
  } catch (error) {
    if (isAPIError(error)) {
      return undefined;
    }
    throw error;
  }
}

export function parseCustomAlertQueryBody(
  client: Client,
  body: JSONObject
): ParsedCustomAlertQuery | number | undefined {
  const customAlert = body.customAlert;
  if (!isJSONObject(customAlert)) {
    return undefined;
  }

  const queryJsonString = customAlert.queryJsonString;
  if (typeof queryJsonString !== 'string') {
    return undefined;
  }

  let query: unknown;
  try {
    query = JSON.parse(queryJsonString);
  } catch {
    const message = 'Invalid JSON in customAlert.queryJsonString.';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message,
        hint: 'Provide queryJsonString as an escaped JSON string. Run `vercel alerts rules schema --type custom_alert` for examples.',
      },
      1
    );
    output.error(message);
    return 1;
  }

  if (!isJSONObject(query)) {
    return undefined;
  }

  return { customAlert, query };
}

export function setMissingCustomAlertProjectScope(
  parsedQuery: ParsedCustomAlertQuery,
  teamId: string,
  projectId: string,
  projectName?: string
): void {
  const existingScope = parsedQuery.query.scope;
  if (existingScope !== undefined && !isJSONObject(existingScope)) {
    return;
  }

  const projectScope = existingScope ?? {
    type: 'project',
    ownerId: teamId,
    projectIds: [projectId],
  };
  if (!Object.hasOwn(projectScope, 'projectId')) {
    projectScope.projectId = projectId;
  }
  if (projectName && !Object.hasOwn(projectScope, 'projectName')) {
    projectScope.projectName = projectName;
  }

  parsedQuery.query.scope = projectScope;
  parsedQuery.customAlert.queryJsonString = JSON.stringify(parsedQuery.query);
}
