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
      "We'll create an API key to use with your coding agents. What team should it be under?"
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
            'ai-gateway setup-coding-agents --scope <team-slug>'
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
