import { hostname, userInfo } from 'node:os';
import chalk from 'chalk';
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

export interface KeyOptions {
  name?: string;
  budget?: number;
  refreshPeriod?: string;
  includeByok?: boolean;
}

export function defaultKeyName(): string {
  let host = '';
  let user = '';
  try {
    host = hostname();
  } catch {}
  try {
    user = userInfo().username;
  } catch {}
  const device = host.split('.')[0].replace(/[-_]+/g, ' ').trim();
  const who = user.trim();
  if (who && device) return `[${who}'s ${device}] Coding Agents`;
  if (device) return `[${device}] Coding Agents`;
  if (who) return `[${who}] Coding Agents`;
  return 'Coding Agents';
}

export async function promptKeyName(client: Client): Promise<string> {
  const fallback = defaultKeyName();
  const answer = await client.input.text({
    message: `Key name? ${chalk.dim(
      'A new AI Gateway API key will be created for your coding agents'
    )}`,
    default: fallback,
  });
  return answer.trim() || fallback;
}

function hasExplicitScopeFlag(argv: string[]): boolean {
  const args = argv.slice(2);
  return args.some(
    a =>
      a === '--scope' ||
      a === '-S' ||
      a === '--team' ||
      a === '-T' ||
      a.startsWith('--scope=') ||
      a.startsWith('--team=')
  );
}

export async function ensureTeam(
  client: Client,
  opts: { machine: boolean; canPrompt: boolean; yes: boolean }
): Promise<number | undefined> {
  const { machine, canPrompt, yes } = opts;

  if (canPrompt && !yes && !hasExplicitScopeFlag(client.argv)) {
    const org = await selectOrg(
      client,
      `Which team? ${chalk.dim('The API key is created under this team')}`
    );
    client.config.currentTeam = org.type === 'team' ? org.id : undefined;
    return undefined;
  }

  // Non-interactive, an explicit scope, or `--yes`: use the resolved scope.
  if (hasExplicitScopeFlag(client.argv) || client.config.currentTeam) {
    return undefined;
  }

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
            'ai-gateway coding-agents setup --scope <team-slug>'
          ),
        },
      ],
    });
  }
  output.error(message);
  return 1;
}

export async function createKey(
  client: Client,
  opts: KeyOptions
): Promise<string> {
  output.spinner('Creating AI Gateway API key…');
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
