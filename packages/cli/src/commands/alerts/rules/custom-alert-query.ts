import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../../util/client';
import { isJSONObject } from '../../../util/client';
import { outputAgentError } from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import output from '../../../output-manager';

export interface ParsedCustomAlertQuery {
  customAlert: JSONObject;
  query: JSONObject;
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
  projectId: string
): void {
  if (Object.hasOwn(parsedQuery.query, 'scope')) {
    return;
  }

  parsedQuery.query.scope = {
    type: 'project',
    ownerId: teamId,
    projectIds: [projectId],
  };
  parsedQuery.customAlert.queryJsonString = JSON.stringify(parsedQuery.query);
}
