import { describe, it, expect } from 'vitest';
import { getTeamBillingUrl } from '../../../src/util/billing-url';

describe('getTeamBillingUrl', () => {
  it('builds the team billing settings URL from a team slug', () => {
    expect(getTeamBillingUrl('acme')).toBe(
      'https://vercel.com/acme/~/settings/billing'
    );
  });
});
