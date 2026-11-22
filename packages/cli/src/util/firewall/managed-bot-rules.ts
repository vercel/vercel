import type {
  FirewallConfigPatch,
  FirewallConfigResponse,
  ManagedRulesResponse,
} from './types';

/**
 * The managed bot settings, which the dashboard presents as rules but the API
 * keeps outside the custom rule list: two managed rulesets and the BotID
 * toggle. They are reserved — `rules add`, `remove`, `enable`, `disable` and
 * `move` refuse these slugs, and `rules update --action` is the one mutation
 * they accept.
 *
 * All three are project-level. The team-level config (`--team-level`) carries
 * custom rules and IP blocks alone, so nothing here applies to it.
 */
export type ManagedBotRuleId = 'bot-protection' | 'ai-bots' | 'bot-id';

export type ManagedBotAction =
  | 'off'
  | 'log'
  | 'challenge'
  | 'allow'
  | 'deny'
  | 'basic'
  | 'deep-analysis';

export interface ManagedBotRule {
  id: ManagedBotRuleId;
  name: string;
  action: ManagedBotAction;
  /**
   * The id the rule is attributed by in firewall events and traffic queries,
   * for the two settings that are managed rulesets. BotID has none: it gates
   * requests before the WAF and is never the attributed rule.
   */
  wafRuleId?: string;
}

export const MANAGED_BOT_RULE_IDS = [
  'bot-protection',
  'ai-bots',
  'bot-id',
] as const;

/**
 * Accepted identifiers, so the slug a person reads in `rules list` and the
 * `waf_rule_id` an event or traffic row reports both resolve to the same rule.
 */
const ALIASES: Record<string, ManagedBotRuleId> = {
  'bot-protection': 'bot-protection',
  'bot protection': 'bot-protection',
  bot_protection: 'bot-protection',
  bot_filter: 'bot-protection',
  managed_bot_protection: 'bot-protection',
  managed_bot_filter: 'bot-protection',
  'ai-bots': 'ai-bots',
  'ai bots': 'ai-bots',
  ai_bots: 'ai-bots',
  managed_ai_bots: 'ai-bots',
  'bot-id': 'bot-id',
  botid: 'bot-id',
  bot_id: 'bot-id',
};

/** The actions each rule accepts, in the order the dashboard offers them. */
const ACTIONS: Record<ManagedBotRuleId, readonly ManagedBotAction[]> = {
  'bot-protection': ['off', 'log', 'challenge'],
  'ai-bots': ['allow', 'log', 'challenge', 'deny'],
  'bot-id': ['basic', 'deep-analysis'],
};

const NAMES: Record<ManagedBotRuleId, string> = {
  'bot-protection': 'Bot Protection',
  'ai-bots': 'AI Bots',
  'bot-id': 'BotID',
};

const WAF_RULE_IDS: Partial<Record<ManagedBotRuleId, string>> = {
  'bot-protection': 'managed_bot_protection',
  'ai-bots': 'managed_ai_bots',
};

export function resolveManagedBotRuleId(
  identifier: string | undefined
): ManagedBotRuleId | undefined {
  if (!identifier) return undefined;
  return ALIASES[identifier.trim().toLowerCase()];
}

export function managedBotActions(
  id: ManagedBotRuleId
): readonly ManagedBotAction[] {
  return ACTIONS[id];
}

export function formatManagedBotAction(action: ManagedBotAction): string {
  if (action === 'deep-analysis') return 'Deep Analysis';
  return action.charAt(0).toUpperCase() + action.slice(1);
}

/** Bot Protection lives under either the legacy `bot_filter` key or `bot_protection`. */
function botProtectionConfig(managedRules?: ManagedRulesResponse | null) {
  return managedRules?.bot_filter ?? managedRules?.bot_protection;
}

/**
 * An inactive ruleset is Off rather than absent, so the three rules always
 * report a current action and `rules list` can show them as a fixed set.
 */
function currentBotProtectionAction(
  config?: FirewallConfigResponse | null
): ManagedBotAction {
  const ruleset = botProtectionConfig(config?.managedRules);
  if (!ruleset?.active) return 'off';
  return ruleset.action === 'log' ? 'log' : 'challenge';
}

/** AI Bots is the inverse: inactive means the crawlers are allowed through. */
function currentAiBotsAction(
  config?: FirewallConfigResponse | null
): ManagedBotAction {
  const ruleset = config?.managedRules?.ai_bots;
  if (!ruleset?.active) return 'allow';
  if (ruleset.action === 'challenge') return 'challenge';
  if (ruleset.action === 'deny') return 'deny';
  return 'log';
}

function currentBotIdAction(
  config?: FirewallConfigResponse | null
): ManagedBotAction {
  return config?.botIdEnabled ? 'deep-analysis' : 'basic';
}

export function getManagedBotRule(
  config: FirewallConfigResponse | null | undefined,
  id: ManagedBotRuleId
): ManagedBotRule {
  const action =
    id === 'bot-protection'
      ? currentBotProtectionAction(config)
      : id === 'ai-bots'
        ? currentAiBotsAction(config)
        : currentBotIdAction(config);

  return { id, name: NAMES[id], action, wafRuleId: WAF_RULE_IDS[id] };
}

export function getManagedBotRules(
  config?: FirewallConfigResponse | null
): ManagedBotRule[] {
  return MANAGED_BOT_RULE_IDS.map(id => getManagedBotRule(config, id));
}

export function parseManagedBotAction(
  id: ManagedBotRuleId,
  raw: string
): { action: ManagedBotAction } | { error: string } {
  // Display labels ("Deep Analysis") lower-case with spaces; slugs use hyphens.
  const action = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-') as ManagedBotAction;
  const valid = ACTIONS[id];
  if (!valid.includes(action)) {
    return {
      error: `Invalid action "${raw}" for ${NAMES[id]}. Use ${valid.join(', ')}.`,
    };
  }
  return { action };
}

/**
 * The draft change that applies the action. Turning a ruleset off drops the
 * action rather than sending it alongside `active: false`, which the API reads
 * as an enabled ruleset.
 */
export function buildManagedBotPatch(
  id: ManagedBotRuleId,
  action: ManagedBotAction
): FirewallConfigPatch {
  if (id === 'bot-id') {
    return { action: 'botId.toggle', value: action === 'deep-analysis' };
  }

  const patchId = id === 'bot-protection' ? 'bot_protection' : 'ai_bots';
  if (action === 'off' || action === 'allow') {
    return {
      action: 'managedRules.update',
      id: patchId,
      value: { active: false },
    };
  }

  return {
    action: 'managedRules.update',
    id: patchId,
    value: { active: true, action },
  };
}

/**
 * An `--action` for the hint lines that differs from the current value, so the
 * suggested command is never a no-op.
 */
export function suggestedManagedBotAction(
  rule: ManagedBotRule
): ManagedBotAction {
  if (rule.id === 'bot-protection') {
    return rule.action === 'challenge' ? 'log' : 'challenge';
  }
  if (rule.id === 'ai-bots') {
    return rule.action === 'deny' ? 'allow' : 'deny';
  }
  return rule.action === 'deep-analysis' ? 'basic' : 'deep-analysis';
}

/**
 * What the change does to live traffic, for the transitions that start turning
 * requests away. Named in the confirmation prompt so the consequence is read
 * before it is accepted, not after.
 */
export function managedBotTrafficWarning(
  id: ManagedBotRuleId,
  from: ManagedBotAction,
  to: ManagedBotAction
): string | undefined {
  if (id === 'ai-bots' && to === 'deny') {
    return 'AI Bots deny blocks known AI crawlers from this project.';
  }
  if (id === 'bot-protection' && from === 'off' && to === 'challenge') {
    return 'Bot Protection challenge will present a verification page to non-browser traffic.';
  }
  return undefined;
}

export function managedBotJson(rule: ManagedBotRule) {
  return {
    id: rule.id,
    name: rule.name,
    action: rule.action,
    wafRuleId: rule.wafRuleId ?? null,
  };
}
