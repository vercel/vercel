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

/** Dim connector that visually nests a follow-up question under its parent. */
const CHILD_PROMPT = chalk.dim('↳');

/** Interactively-resolved options for a newly created key. */
export interface KeyOptions {
  name?: string;
  budget?: number;
  refreshPeriod?: string;
  includeByok?: boolean;
  expiresAt?: number;
}

/**
 * A human-readable default key name that hints at the owner and machine, e.g.
 * `[smrth's MacBook Pro] Coding Agents`. Falls back gracefully when the user or
 * hostname is unavailable.
 */
export function defaultKeyName(): string {
  let host = '';
  let user = '';
  try {
    host = hostname();
  } catch {
    // hostname() can throw in locked-down sandboxes; fall through to default.
  }
  try {
    user = userInfo().username;
  } catch {
    // userInfo() can throw without a passwd entry; fall through.
  }
  const device = host.split('.')[0].replace(/[-_]+/g, ' ').trim();
  const who = user.trim();
  if (who && device) return `[${who}'s ${device}] Coding Agents`;
  if (device) return `[${device}] Coding Agents`;
  if (who) return `[${who}] Coding Agents`;
  return 'Coding Agents';
}

/**
 * Prompts for the key name. Carries the "we'll create a key" explainer since it
 * is the first question in the create flow. Returns the trimmed input or the
 * machine-derived default when left blank.
 */
export async function promptKeyName(client: Client): Promise<string> {
  const fallback = defaultKeyName();
  const answer = await client.input.text({
    message:
      'An AI Gateway API key will be created to use with your coding agents. What should it be called?',
    default: fallback,
  });
  return answer.trim() || fallback;
}

/**
 * Optionally prompts for a spend limit and its refresh cadence. Both default to
 * "no" — declining returns an empty object so the key is created without a quota.
 */
export async function promptQuota(client: Client): Promise<{
  budget?: number;
  refreshPeriod?: string;
}> {
  const wantsQuota = await client.input.confirm(
    'Set a spend limit (quota) for this key?',
    false
  );
  if (!wantsQuota) {
    return {};
  }
  const amount = await client.input.text({
    // Indent the follow-up questions so they read as children of the quota prompt.
    message: `${CHILD_PROMPT} Spend limit in USD`,
    default: '100',
    validate: value => {
      const n = Number(value);
      return Number.isFinite(n) && n >= 1
        ? true
        : 'Enter a number of dollars (minimum 1).';
    },
  });
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
  return { budget: Number(amount), refreshPeriod };
}

/**
 * Optionally prompts for an expiry. Defaults to "no" — declining returns
 * `undefined` so the key never expires.
 */
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

/**
 * Asks whether to store the key in the macOS Keychain. Defaults to yes so the
 * secret stays out of plaintext config files; declining writes it directly.
 */
export async function promptKeychain(client: Client): Promise<boolean> {
  return client.input.confirm(
    'Store the API key in your macOS Keychain?',
    true
  );
}

/** Whether the user pinned a scope explicitly via `--scope`/`--team`. */
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

/**
 * Resolves which team owns the new key. Key ownership is a deliberate choice, so
 * when we can prompt we always ask — even if a `currentTeam` is already set —
 * defaulting the highlighted option to that team. The prompt is skipped when the
 * user pinned a scope (`--scope`/`--team`) or opted into defaults (`--yes`), and
 * non-interactive runs fall back to the resolved scope or error without one.
 */
export async function ensureTeam(
  client: Client,
  opts: { machine: boolean; canPrompt: boolean; yes: boolean }
): Promise<number | undefined> {
  const { machine, canPrompt, yes } = opts;

  if (canPrompt && !yes && !hasExplicitScopeFlag(client.argv)) {
    const org = await selectOrg(
      client,
      'What team should the API key be under?'
    );
    // Picking the personal account clears any team scope so the key is created
    // on the user's account rather than the previously selected team.
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
            'ai-gateway coding-agents connect --scope <team-slug>'
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
  output.spinner('Creating AI Gateway API key');
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
