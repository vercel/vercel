import { describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import { formatPricing } from '../../../../src/commands/pricing/format';
import {
  parsePricingMarkdown,
  splitFeaturesByMinPlan,
  withCurrentPlanAvailability,
} from '../../../../src/commands/pricing/parse-pricing';
import type { PricingResult } from '../../../../src/commands/pricing/types';
import { PRICING_FIXTURE } from './fixture';

function render(): string[] {
  const features = withCurrentPlanAvailability(
    parsePricingMarkdown(PRICING_FIXTURE),
    null
  );
  const result = {
    plan: null,
    team: null,
    source: 'test',
    query: null,
    summary: {
      total: features.length,
      matched: features.length,
      availableOnCurrentPlan: null,
      unavailableOnCurrentPlan: null,
      hobby: 0,
      pro: 0,
      enterprise: 0,
    },
    features: splitFeaturesByMinPlan(features),
  } satisfies PricingResult;
  return stripAnsi(formatPricing(result)).split('\n');
}

describe('formatPricing', () => {
  it('prints the category header for a row named after its category', () => {
    const lines = render();
    const header = lines.indexOf('  Microfrontends');
    expect(header).toBeGreaterThan(-1);
    expect(lines[header + 1]).toMatch(/^ {4}Microfrontends\s/);
  });

  it('prints rows from tables with no Feature column at header indent', () => {
    const lines = render();
    expect(lines.some(line => /^ {2}Edge Requests\s/.test(line))).toBe(true);
    expect(lines).not.toContain('  Edge Requests');
  });
});
