import type {
  FirewallConfigPatch,
  FirewallConfigResponse,
  ManagedRulesResponse,
} from './types';

function botProtectionConfig(managedRules?: ManagedRulesResponse | null) {
  return managedRules?.bot_filter ?? managedRules?.bot_protection;
}

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
  wafRuleId?: string;
}

const ALIASES: Record<string, ManagedBotRuleId> = {
  'bot-protection': 'bot-protection',
  bot_protection: 'bot-protection',
  bot_filter: 'bot-protection',
  managed_bot_protection: 'bot-protection',
  managed_bot_filter: 'bot-protection',
  'ai-bots': 'ai-bots',
  ai_bots: 'ai-bots',
  managed_ai_bots: 'ai-bots',
  'bot-id': 'bot-id',
  botid: 'bot-id',
  bot_id: 'bot-id',
};

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

export function managedBotRuleName(id: ManagedBotRuleId): string {
  return NAMES[id];
}

export function formatManagedBotAction(action: ManagedBotAction): string {
  if (action === 'deep-analysis') return 'Deep Analysis';
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function currentBotProtectionAction(
  config?: FirewallConfigResponse | null
): ManagedBotAction {
  const ruleset = botProtectionConfig(config?.managedRules);
  if (!ruleset?.active) return 'off';
  return ruleset.action === 'log' ? 'log' : 'challenge';
}

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

  return {
    id,
    name: NAMES[id],
    action,
    wafRuleId: WAF_RULE_IDS[id],
  };
}

export function getManagedBotRules(
  config?: FirewallConfigResponse | null
): ManagedBotRule[] {
  return (['bot-protection', 'ai-bots', 'bot-id'] as const).map(id =>
    getManagedBotRule(config, id)
  );
}

export function parseManagedBotAction(
  id: ManagedBotRuleId,
  raw: string
): { action: ManagedBotAction } | { error: string } {
  const action = raw.trim().toLowerCase() as ManagedBotAction;
  const valid = ACTIONS[id];
  if (!valid.includes(action)) {
    return {
      error: `Invalid action "${raw}" for ${NAMES[id]}. Use ${valid.join(', ')}.`,
    };
  }
  return { action };
}

export function buildManagedBotPatch(
  id: ManagedBotRuleId,
  action: ManagedBotAction
): FirewallConfigPatch {
  if (id === 'bot-id') {
    return {
      action: 'botId.toggle',
      value: action === 'deep-analysis',
    };
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

/** Suggested `--action` that differs from the current value. */
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

export function managedBotNeedsLouderConfirm(
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

export function reservedManagedBotMutationMessage(
  identifier: string | undefined,
  verb: string,
  suggest: (command: string) => string
): string | undefined {
  const id = resolveManagedBotRuleId(identifier);
  if (!id) return undefined;
  return `Can't ${verb} "${identifier}". That's a managed bot rule. Use ${suggest(`firewall rules edit ${id} --action <action>`)}.`;
}

export function managedBotJson(rule: ManagedBotRule) {
  return {
    id: rule.id,
    name: rule.name,
    action: rule.action,
    wafRuleId: rule.wafRuleId ?? null,
  };
}
