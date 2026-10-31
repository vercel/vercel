import { describe, expect, it } from 'vitest';
import {
  featureMatchesQuery,
  isFeatureAvailable,
  isValidPricingTable,
  minPlanForFeature,
  MIN_PRICING_FEATURES,
  normalizePlan,
  parsePricingMarkdown,
  sanitizeRemoteText,
  slugify,
  splitFeaturesByMinPlan,
  withCurrentPlanAvailability,
} from '../../../../src/commands/pricing/parse-pricing';
import { PRICING_FIXTURE } from './fixture';

describe('parsePricingMarkdown', () => {
  const features = parsePricingMarkdown(PRICING_FIXTURE);

  it('skips the plan comparison table and FAQ copy', () => {
    expect(features.find(feature => feature.name === 'Hobby')).toBeUndefined();
    expect(
      features.find(feature =>
        feature.name.includes('personal, non-commercial')
      )
    ).toBeUndefined();
  });

  it('attaches list descriptions that wrap the name in markdown bold', () => {
    const firewall = features.find(
      feature => feature.name === 'Custom Firewall Rules'
    );
    expect(firewall?.description).toBe(
      "Granular control of your application's traffic."
    );

    const skew = features.find(feature => feature.name === 'Skew Protection');
    expect(skew?.description).toBe(
      'Prevents runtime and asset mismatch errors during new rollouts.'
    );
  });

  it('parses feature-column tables', () => {
    const skew = features.find(feature => feature.name === 'Skew Protection');
    expect(skew).toMatchObject({
      slug: 'skew-protection',
      section: 'Build & Deploy',
      category: 'Deployments',
      description:
        'Prevents runtime and asset mismatch errors during new rollouts.',
      values: {
        hobby: 'Not available',
        pro: 'Included',
        enterprise: 'Included',
      },
      available: { hobby: false, pro: true, enterprise: true },
      minPlan: 'pro',
    });
  });

  it('uses the subsection title for tables without a Feature column', () => {
    const edgeRequests = features.find(
      feature => feature.name === 'Edge Requests'
    );
    expect(edgeRequests).toMatchObject({
      category: 'Edge Requests',
      description:
        'Optimized network requests for globally fast and secure content access.',
      values: {
        hobby: '1M / month included',
        pro: '10M / month included; then starting at $2 per 1M',
        enterprise: 'Custom',
      },
      minPlan: 'hobby',
    });
  });

  it('strips markdown links from headings used as feature names', () => {
    const edgeRequests = features.find(
      feature => feature.name === 'Edge Requests'
    );
    expect(edgeRequests?.slug).toBe('edge-requests');
    expect(edgeRequests?.category).toBe('Edge Requests');
    for (const feature of features) {
      expect(feature.name).not.toContain('](');
      expect(feature.slug).not.toContain('vercel-com');
    }
  });

  it('treats em dashes as unavailable', () => {
    const v0 = features.find(feature => feature.name === 'v0');
    expect(v0?.available).toEqual({
      hobby: false,
      pro: true,
      enterprise: true,
    });
    expect(v0?.values.pro).toBe('Paid add-on');
    expect(v0?.minPlan).toBe('pro');
  });

  it('splits features into hobby, pro, and enterprise by lowest plan', () => {
    const grouped = splitFeaturesByMinPlan(
      withCurrentPlanAvailability(features, 'hobby')
    );
    expect(grouped.hobby.map(feature => feature.name)).toEqual(
      expect.arrayContaining([
        'Global Points of Presence',
        'Edge Requests',
        'Custom Firewall Rules',
        'Automatic CI/CD',
      ])
    );
    expect(grouped.pro.map(feature => feature.name)).toEqual(
      expect.arrayContaining([
        'System Bypass Rules',
        'Webhook Triggers',
        'Skew Protection',
        'v0',
      ])
    );
    expect(grouped.enterprise.map(feature => feature.name)).toEqual(
      expect.arrayContaining(['OWASP Core Ruleset (managed)', 'Audit Logs'])
    );
    expect(
      grouped.hobby.find(feature => feature.name === 'Audit Logs')
    ).toBeUndefined();
  });

  it('matches queries against name, category, and values', () => {
    const skew = features.find(feature => feature.name === 'Skew Protection');
    expect(skew && featureMatchesQuery(skew, 'skew')).toBe(true);
    expect(skew && featureMatchesQuery(skew, 'mismatch errors')).toBe(true);
    expect(skew && featureMatchesQuery(skew, 'firewall')).toBe(false);
  });

  it('strips ANSI and control characters from remote fields', () => {
    const parsed = parsePricingMarkdown(`## Build
### Deployments

| Feature | Hobby | Pro | Enterprise |
| --- | --- | --- | --- |
| \u001b[31mSafe Feature\u001b[0m | \u001b[32mIncluded\u001b[0m | Included | Included |

- **Safe Feature:** \u001b]8;;https://evil.example\u0007Injected\u001b]8;;\u0007 description.
`);
    expect(parsed[0]).toMatchObject({
      name: 'Safe Feature',
      values: { hobby: 'Included', pro: 'Included', enterprise: 'Included' },
      description: 'Injected description.',
    });
    expect(parsed[0].name).not.toMatch(/\u001b/);
    expect(parsed[0].description).not.toContain('evil.example');
  });

  it('accepts the fixture as a complete pricing table', () => {
    expect(features.length).toBeGreaterThanOrEqual(MIN_PRICING_FEATURES);
    expect(isValidPricingTable(features)).toBe(true);
  });

  it('rejects a sparse table', () => {
    const sparse = parsePricingMarkdown(`| Feature | Hobby | Pro | Enterprise |
| --- | --- | --- | --- |
| Only One | Included | Included | Included |
`);
    expect(sparse).toHaveLength(1);
    expect(isValidPricingTable(sparse)).toBe(false);
  });
});

describe('plan helpers', () => {
  it('normalizes known plans and maps plus to pro', () => {
    expect(normalizePlan('Hobby')).toBe('hobby');
    expect(normalizePlan('plus')).toBe('pro');
    expect(normalizePlan('enterprise')).toBe('enterprise');
    expect(normalizePlan('unknown')).toBeNull();
  });

  it('detects unavailable values', () => {
    expect(isFeatureAvailable('Included')).toBe(true);
    expect(isFeatureAvailable('Paid add-on')).toBe(true);
    expect(isFeatureAvailable('Not available')).toBe(false);
    expect(isFeatureAvailable('—')).toBe(false);
    expect(isFeatureAvailable('')).toBe(false);
  });

  it('picks the lowest plan that includes a feature', () => {
    expect(
      minPlanForFeature({ hobby: true, pro: true, enterprise: true })
    ).toBe('hobby');
    expect(
      minPlanForFeature({ hobby: false, pro: true, enterprise: true })
    ).toBe('pro');
    expect(
      minPlanForFeature({ hobby: false, pro: false, enterprise: true })
    ).toBe('enterprise');
  });

  it('slugifies feature names', () => {
    expect(slugify('SAML Single Sign-On (SSO)')).toBe(
      'saml-single-sign-on-sso'
    );
  });

  it('sanitizes remote markdown text', () => {
    expect(sanitizeRemoteText('\u001b[31m**Bold**\u001b[0m  name')).toBe(
      'Bold name'
    );
  });
});
