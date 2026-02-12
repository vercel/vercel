import stripAnsi from 'strip-ansi';
import { describe, expect, it } from 'vitest';
import { formatBillingPlansHelp } from '../../../../src/util/integration/format-billing-plans-help';
import type { BillingPlan } from '../../../../src/util/integration/types';

function makePlan(
  overrides: Partial<BillingPlan> & { id: string; name: string }
): BillingPlan {
  return {
    type: 'subscription',
    scope: 'installation',
    description: '',
    paymentMethodRequired: false,
    details: [],
    ...overrides,
  };
}

describe('formatBillingPlansHelp', () => {
  it('should list enabled plans with aligned IDs', () => {
    const plans = [
      makePlan({ id: 'pro', name: 'Pro Plan', cost: '$25/m' }),
      makePlan({ id: 'enterprise', name: 'Enterprise Plan', cost: '$599/m' }),
    ];
    const result = stripAnsi(formatBillingPlansHelp('Acme Product', plans));

    expect(result).toContain('Available billing plans for "Acme Product"');
    expect(result).toContain('pro         Pro Plan ($25/m)');
    expect(result).toContain('enterprise  Enterprise Plan ($599/m)');
  });

  it('should show usage example with first plan ID', () => {
    const plans = [
      makePlan({ id: 'starter', name: 'Starter' }),
      makePlan({ id: 'pro', name: 'Pro' }),
    ];
    const result = stripAnsi(formatBillingPlansHelp('Acme', plans));

    expect(result).toContain('Usage:');
    expect(result).toContain('--plan starter');
  });

  it('should return empty string when no plans', () => {
    const result = formatBillingPlansHelp('Acme', []);
    expect(result).toBe('');
  });

  it('should filter out disabled plans', () => {
    const plans = [
      makePlan({ id: 'pro', name: 'Pro Plan' }),
      makePlan({ id: 'free', name: 'Free Plan', disabled: true }),
    ];
    const result = stripAnsi(formatBillingPlansHelp('Acme', plans));

    expect(result).toContain('pro');
    expect(result).not.toContain('free');
  });

  it('should return empty string when all plans are disabled', () => {
    const plans = [makePlan({ id: 'free', name: 'Free Plan', disabled: true })];
    const result = formatBillingPlansHelp('Acme', plans);
    expect(result).toBe('');
  });

  it('should handle plans without cost', () => {
    const plans = [makePlan({ id: 'free', name: 'Free Plan' })];
    const result = stripAnsi(formatBillingPlansHelp('Acme', plans));

    expect(result).toContain('free  Free Plan');
    // No cost suffix
    expect(result).not.toContain('($');
  });
});
