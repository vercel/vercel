import type Client from '../../client';
import output from '../../../output-manager';
import { getCommandName } from '../../pkg-name';
import createApiKeyRequest from '../create-api-key';
import selectOrg from '../../input/select-org';
import { buildQuota } from '../quota';
import { outputAgentError } from '../../agent-output';
import { AGENT_STATUS, AGENT_REASON } from '../../agent-output-constants';

export interface KeySource {
  key: string;
  created: boolean;
}

/**
 * Ensures a team is selected before key creation, prompting interactively or
 * returning an exit code when running non-interactively without a scope.
 */
export async function ensureTeam(
  client: Client,
  machine: boolean,
  canPrompt: boolean
): Promise<number | undefined> {
  if (client.config.currentTeam) {
    return undefined;
  }
  if (!canPrompt) {
    const message =
      'No team selected. Pass --scope <team-slug> or run `vercel switch` first.';
    if (machine) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.MISSING_SCOPE,
        message,
        next: [
          {
            command: getCommandName(
              'ai-gateway setup-coding-agents --scope <team-slug>'
            ),
          },
        ],
      });
    }
    output.error(message);
    return 1;
  }
  const org = await selectOrg(client, 'Which team should own this API key?');
  if (org.type === 'team') {
    client.config.currentTeam = org.id;
  }
  return undefined;
}

export async function createKey(
  client: Client,
  opts: {
    name?: string;
    budget?: number;
    refreshPeriod?: string;
    includeByok?: boolean;
  }
): Promise<string> {
  output.spinner('Creating AI Gateway API key');
  try {
    const result = await createApiKeyRequest(client, {
      name: opts.name,
      aiGatewayQuota: buildQuota({
        budget: opts.budget,
        refreshPeriod: opts.refreshPeriod,
        includeByok: opts.includeByok,
      }),
    });
    return result.apiKeyString;
  } finally {
    output.stopSpinner();
  }
}
