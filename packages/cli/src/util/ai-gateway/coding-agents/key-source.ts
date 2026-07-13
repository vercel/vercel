import { hostname, userInfo } from 'node:os';
import chalk from 'chalk';
import type Client from '../../client';
import output from '../../../output-manager';
import { getCommandName } from '../../pkg-name';
import createApiKeyRequest from '../create-api-key';
import selectOrg from '../../input/select-org';
import { buildQuota } from '../quota';
import {
  EXPIRY_PRESETS,
  DEFAULT_EXPIRY_PRESET,
  presetToExpiresAt,
} from '../expiry';
import { outputAgentError } from '../../agent-output';
import { AGENT_STATUS, AGENT_REASON } from '../../agent-output-constants';

export interface KeySource {
  key: string;
  created: boolean;
}

const CHILD_PROMPT = chalk.dim('↳');

export interface KeyOptions {
  name?: string;
  budget?: number;
  refreshPeriod?: string;
  includeByok?: boolean;
  expiresAt?: number;
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

export async function promptQuota(client: Client): Promise<{
  budget?: number;
  refreshPeriod?: string;
}> {
  const wantsQuota = await client.input.confirm(
    'Set a spend limit for this key?',
    false
  );
  if (!wantsQuota) {
    return {};
  }
  const refreshPeriod = await client.input.select<string>({
    message: `${CHILD_PROMPT} How often should the limit reset?`,
    choices: [
      { name: 'Never (one-time limit)', value: 'none' },
      { name: 'Daily', value: 'daily' },
      { name: 'Weekly', value: 'weekly' },
      { name: 'Monthly', value: 'monthly' },
    ],
    default: 'none',
  });
  const amount = await client.input.text({
    message: `${CHILD_PROMPT} Spend limit in USD`,
    default: '100',
    validate: value => {
      const n = Number(value);
      return Number.isFinite(n) && n >= 1
        ? true
        : 'Enter a number of dollars (minimum 1).';
    },
  });
  return { budget: Number(amount), refreshPeriod };
}

export async function promptExpiry(
  client: Client
): Promise<number | undefined> {
  const wantsExpiry = await client.input.confirm(
    'Set an expiration for this key?',
    false
  );
  if (!wantsExpiry) {
    return undefined;
  }
  const preset = await client.input.select<string>({
    message: `${CHILD_PROMPT} Expires in`,
    choices: EXPIRY_PRESETS.map(p => ({ name: p.label, value: p.value })),
    default: DEFAULT_EXPIRY_PRESET,
  });
  return presetToExpiresAt(preset);
}

export async function promptKeychain(client: Client): Promise<boolean> {
  return client.input.confirm(
    'Store the API key in your macOS Keychain?',
    true
  );
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
      ...(opts.expiresAt !== undefined && { expiresAt: opts.expiresAt }),
    });
    return result.apiKeyString;
  } finally {
    output.stopSpinner();
  }
}
