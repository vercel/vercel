import { describe, expect, it } from 'vitest';
import {
  buildManagedBotPatch,
  getManagedBotRules,
  parseManagedBotAction,
  resolveManagedBotRuleId,
  suggestedManagedBotAction,
} from '../../../../src/util/firewall/managed-bot-rules';

describe('managed-bot-rules', () => {
  it('resolves reserved slugs and observability ids', () => {
    expect(resolveManagedBotRuleId('bot-protection')).toEqual('bot-protection');
    expect(resolveManagedBotRuleId('managed_bot_protection')).toEqual(
      'bot-protection'
    );
    expect(resolveManagedBotRuleId('managed_bot_filter')).toEqual(
      'bot-protection'
    );
    expect(resolveManagedBotRuleId('ai-bots')).toEqual('ai-bots');
    expect(resolveManagedBotRuleId('managed_ai_bots')).toEqual('ai-bots');
    expect(resolveManagedBotRuleId('bot-id')).toEqual('bot-id');
    expect(resolveManagedBotRuleId('rule_001')).toBeUndefined();
  });

  it('defaults to off / allow / basic when unset', () => {
    const rules = getManagedBotRules(null);
    expect(rules.map(r => [r.id, r.action])).toEqual([
      ['bot-protection', 'off'],
      ['ai-bots', 'allow'],
      ['bot-id', 'basic'],
    ]);
  });

  it('reads current actions from config', () => {
    const rules = getManagedBotRules({
      ownerId: 'team',
      projectKey: 'proj',
      id: 'cfg',
      version: 1,
      updatedAt: '',
      firewallEnabled: true,
      rules: [],
      ips: [],
      changes: [],
      botIdEnabled: true,
      managedRules: {
        bot_filter: { active: true, action: 'challenge' },
        ai_bots: { active: true, action: 'deny' },
      },
    });
    expect(rules.map(r => r.action)).toEqual([
      'challenge',
      'deny',
      'deep-analysis',
    ]);
  });

  it('builds managedRules.update and botId.toggle patches', () => {
    expect(buildManagedBotPatch('bot-protection', 'off')).toEqual({
      action: 'managedRules.update',
      id: 'bot_protection',
      value: { active: false },
    });
    expect(buildManagedBotPatch('ai-bots', 'deny')).toEqual({
      action: 'managedRules.update',
      id: 'ai_bots',
      value: { active: true, action: 'deny' },
    });
    expect(buildManagedBotPatch('bot-id', 'deep-analysis')).toEqual({
      action: 'botId.toggle',
      value: true,
    });
  });

  it('rejects unknown actions', () => {
    expect(parseManagedBotAction('bot-protection', 'deny')).toEqual({
      error: expect.stringContaining('Invalid action'),
    });
  });

  it('suggests a different action than the current one', () => {
    expect(
      suggestedManagedBotAction({
        id: 'bot-protection',
        name: 'Bot Protection',
        action: 'challenge',
      })
    ).toEqual('log');
    expect(
      suggestedManagedBotAction({
        id: 'ai-bots',
        name: 'AI Bots',
        action: 'allow',
      })
    ).toEqual('deny');
  });
});
