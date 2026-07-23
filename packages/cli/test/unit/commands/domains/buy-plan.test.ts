import { describe, expect, it } from 'vitest';
import {
  describePurchaseFailure,
  planPurchase,
  type PurchaseCommands,
  type PurchaseIntent,
} from '../../../../src/commands/domains/buy-plan';
import type { PurchaseFacts } from '../../../../src/commands/domains/buy-acquisition';
import type { BuyCommandPrefill } from '../../../../src/commands/domains/buy-plan';

function facts(overrides: Partial<PurchaseFacts> = {}): PurchaseFacts {
  return {
    domainName: 'example.com',
    contextName: 'acme',
    teamSlug: 'acme',
    available: true,
    purchasePrice: 12,
    renewalPrice: 14,
    years: 1,
    ...overrides,
  };
}

function intent(overrides: Partial<PurchaseIntent> = {}): PurchaseIntent {
  return { contact: {}, ...overrides };
}

function commands(): PurchaseCommands & { buyCalls: BuyCommandPrefill[] } {
  const buyCalls: BuyCommandPrefill[] = [];
  return {
    buyCalls,
    buy(prefill: BuyCommandPrefill) {
      buyCalls.push(prefill);
      return `vercel domains buy example.com --years ${prefill.years} --expected-price ${prefill.expectedPrice}`;
    },
    search: 'vercel domains search example',
    price: 'vercel domains price example.com',
    transferIn: 'vercel domains transfer-in example.com',
    openDashboard: "open 'https://vercel.com/dashboard/domains'",
    openBilling: "open 'https://vercel.com/acme/~/settings/billing'",
  };
}

describe('planPurchase', () => {
  it('prepares an action_required plan (exit 0) when the domain is buyable', () => {
    const cmds = commands();
    const plan = planPurchase(facts(), intent(), cmds);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.exitCode).toBe(0);
    expect(plan.reason).toBe('purchase_requires_user');
    expect(plan.action).toBe('confirmation_required');
    expect(plan.order).toEqual({
      domain: 'example.com',
      contextName: 'acme',
      purchasePrice: 12,
      renewalPrice: 14,
      years: 1,
      autoRenew: undefined,
    });
    expect(plan.message).toContain('available to buy under acme for $12');
    expect(plan.message).toContain('agents must not buy domains');
    // The prefilled command pins the quoted price as an optimistic-concurrency guard.
    expect(cmds.buyCalls[0]).toMatchObject({ years: 1, expectedPrice: 12 });
    expect(plan.next[0].command).toContain('--expected-price 12');
    expect(plan.next[0].when).toContain('interactively');
    expect(plan.next[1].command).toContain('vercel.com/dashboard/domains');
  });

  it('lists missing required contact flags and excludes provided ones', () => {
    const plan = planPurchase(
      facts(),
      intent({ contact: { email: 'jane@example.com', country: 'US' } }),
      commands()
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.missingContactFlags).toEqual([
      '--first-name',
      '--last-name',
      '--phone',
      '--address',
      '--city',
      '--state',
      '--zip',
    ]);
    expect(plan.hint).toContain('missing registrant contact details');
  });

  it('reports complete contact details with a hand-off hint', () => {
    const plan = planPurchase(
      facts(),
      intent({
        contact: {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          phone: '+15551234567',
          address1: '1 Main St',
          city: 'SF',
          state: 'CA',
          zip: '94105',
          country: 'US',
        },
      }),
      commands()
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.missingContactFlags).toEqual([]);
    expect(plan.hint).toContain('All purchase details are prefilled');
  });

  it('fails with domain_not_available when the domain is taken', () => {
    const plan = planPurchase(
      facts({ available: false }),
      intent(),
      commands()
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.exitCode).toBe(1);
    expect(plan.reason).toBe('domain_not_available');
    expect(plan.next.map(step => step.command)).toEqual([
      'vercel domains search example',
      'vercel domains transfer-in example.com',
    ]);
  });

  it('fails with api_error when the quote has no price', () => {
    const plan = planPurchase(
      facts({ purchasePrice: null, renewalPrice: null }),
      intent(),
      commands()
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe('api_error');
    expect(plan.next[0].command).toBe('vercel domains price example.com');
  });

  it('fails with invalid_arguments when --years does not match the quote', () => {
    const plan = planPurchase(facts(), intent({ years: 3 }), commands());
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe('invalid_arguments');
    expect(plan.message).toContain('quoted for a 1-year term');
    expect(plan.next[0].command).toContain('--years 1');
  });

  it('fails with price_changed when --expected-price does not match the quote', () => {
    const plan = planPurchase(
      facts({ purchasePrice: 20 }),
      intent({ expectedPrice: 12 }),
      commands()
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe('price_changed');
    expect(plan.message).toContain('$20');
    expect(plan.message).toContain('$12');
    expect(plan.next[0].command).toContain('--expected-price 20');
  });

  it('accepts a matching --expected-price and --years', () => {
    const plan = planPurchase(
      facts(),
      intent({ years: 1, expectedPrice: 12 }),
      commands()
    );
    expect(plan.ok).toBe(true);
  });
});

describe('describePurchaseFailure', () => {
  it('maps payment failures to the billing dashboard', () => {
    const failure = describePurchaseFailure(
      'example.com',
      'payment-failed',
      commands()
    );
    expect(failure.reason).toBe('payment_failed');
    expect(failure.next[0].command).toContain('settings/billing');
  });

  it('maps additional contact info requirements to the dashboard, not TLD support', () => {
    const failure = describePurchaseFailure(
      'example.com',
      'contact-info-required',
      commands()
    );
    expect(failure.reason).toBe('additional_contact_info_required');
    expect(failure.message).toContain('additional contact information');
    expect(failure.message).not.toContain('TLD');
    expect(failure.next[0].command).toContain('vercel.com/dashboard/domains');
  });

  it('maps unsupported TLDs to a domain search', () => {
    const failure = describePurchaseFailure(
      'example.wat',
      'tld-not-supported',
      commands()
    );
    expect(failure.reason).toBe('tld_not_supported');
    expect(failure.next[0].command).toBe('vercel domains search example');
  });
});
