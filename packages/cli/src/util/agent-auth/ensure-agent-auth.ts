import type Client from '../client';
import type { ProjectLinked } from '@vercel-internals/types';
import type { AgentOAuthEntry, GlobalConfig } from '@vercel-internals/types';
import { performDeviceCodeFlow } from '../../commands/login/future';
import { refreshTokenRequest, processTokenResponse } from '../oauth';
import { writeToConfigFile } from '../config/files';
import output from '../../output-manager';
import { getCommandName } from '../pkg-name';
import { outputAgentError } from '../agent-output';

/** Config key for agent OAuth: projectId:orgId:agentName */
export function getAgentOAuthConfigKey(
  projectId: string,
  orgId: string,
  agentName: string
): string {
  return `${projectId}:${orgId}:${agentName}`;
}

export interface AgentAuthResult {
  token: string;
  refreshToken?: string;
  expiresAt?: number;
  /** Key in config.agentOAuth used for refresh */
  _configKey: string;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

function isValidAgentToken(entry: AgentOAuthEntry): boolean {
  if (!entry.token) return false;
  if (typeof entry.expiresAt !== 'number') return true;
  return entry.expiresAt >= nowSeconds();
}

/**
 * When running as an AI agent with a linked project, ensures an agent OAuth
 * token exists for this project+agent. If none exists and the user is logged
 * in, runs the device flow and stores the token. If the user is not logged in,
 * outputs a warning and returns an exit code.
 *
 * Call this after ensureLink when link.status === 'linked' and client.isAgent.
 * Returns the token result to set on client.agentAuthConfig, or an exit code.
 *
 * When forceCreate is true (e.g. for `vercel agent setup`), runs the same flow
 * even when not in agent context, so users can create an agent OAuth app for
 * future agent use.
 *
 * TODO: Configure permissions for the AI agent OAuth app (e.g. scopes, project-level restrictions).
 */
export async function ensureAgentAuth(
  client: Client,
  link: ProjectLinked,
  options?: { forceCreate?: boolean }
): Promise<AgentAuthResult | number> {
  const forceCreate = options?.forceCreate === true;
  const isAgentContext = client.isAgent || forceCreate;

  if (!isAgentContext || link.status !== 'linked') {
    return 1;
  }

  const agentName = client.agentName ?? (forceCreate ? 'default' : 'unknown');
  const projectId = link.project.id;
  const orgId = link.org.id;
  const configKey = getAgentOAuthConfigKey(projectId, orgId, agentName);

  const config: GlobalConfig = client.config;
  const agentOAuth = config.agentOAuth ?? {};
  let entry: AgentOAuthEntry | undefined = agentOAuth[configKey];

  // Refresh if we have a stored entry with expired token but valid refresh token
  if (entry?.refreshToken && !isValidAgentToken(entry)) {
    const tokenResponse = await refreshTokenRequest({
      refresh_token: entry.refreshToken,
    });
    const [err, tokens] = await processTokenResponse(tokenResponse);
    if (!err && tokens) {
      const newEntry: AgentOAuthEntry = {
        token: tokens.access_token,
        expiresAt: nowSeconds() + tokens.expires_in,
        refreshToken: tokens.refresh_token ?? entry.refreshToken,
      };
      client.updateConfig({
        agentOAuth: { ...agentOAuth, [configKey]: newEntry },
      });
      writeToConfigFile(client.config);
      return {
        token: newEntry.token,
        refreshToken: newEntry.refreshToken,
        expiresAt: newEntry.expiresAt,
        _configKey: configKey,
      };
    }
    // Refresh failed; clear entry so we re-run device flow below
    entry = undefined;
  }

  // Valid existing token
  if (entry && isValidAgentToken(entry)) {
    return {
      token: entry.token,
      refreshToken: entry.refreshToken,
      expiresAt: entry.expiresAt,
      _configKey: configKey,
    };
  }

  // No agent token: require user to be logged in
  if (!client.authConfig?.token) {
    const message =
      'AI agent mode requires either a logged-in user or a configured agent OAuth token. ' +
      `Run ${getCommandName('login')} first, or run ${getCommandName(
        'agent'
      )} setup to create an agent OAuth app for this project.`;
    output.error(message);
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'agent_not_configured',
          message,
          next: [
            { command: `${getCommandName('login')}` },
            {
              command: `${getCommandName('agent')} setup`,
            },
          ],
        },
        1
      );
    }
    return 1;
  }

  // User is logged in: run device flow to get agent token
  output.log(
    `No agent OAuth token for this project. Completing device flow to create one for ${agentName}...`
  );
  const tokens = await performDeviceCodeFlow(client);
  if (!tokens) {
    output.error('Failed to complete agent OAuth device flow.');
    return 1;
  }

  const newEntry: AgentOAuthEntry = {
    token: tokens.access_token,
    expiresAt: nowSeconds() + tokens.expires_in,
    refreshToken: tokens.refresh_token,
  };
  client.updateConfig({
    agentOAuth: { ...agentOAuth, [configKey]: newEntry },
  });
  writeToConfigFile(client.config);

  return {
    token: newEntry.token,
    refreshToken: newEntry.refreshToken,
    expiresAt: newEntry.expiresAt,
    _configKey: configKey,
  };
}
