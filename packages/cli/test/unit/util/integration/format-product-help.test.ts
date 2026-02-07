import stripAnsi from 'strip-ansi';
import { describe, expect, it } from 'vitest';
import { formatProductHelp } from '../../../../src/util/integration/format-product-help';
import type { IntegrationProduct } from '../../../../src/util/integration/types';

function makeProduct(
  overrides: Partial<IntegrationProduct> & { slug: string; name: string }
): IntegrationProduct {
  return {
    id: overrides.slug,
    shortDescription: '',
    metadataSchema: { type: 'object', properties: {}, required: [] },
    ...overrides,
  };
}

describe('formatProductHelp', () => {
  it('should list all products with aligned columns', () => {
    const products = [
      makeProduct({ slug: 'short', name: 'Short Name' }),
      makeProduct({ slug: 'much-longer-slug', name: 'Long Slug Name' }),
    ];
    const result = stripAnsi(formatProductHelp('acme', products));

    expect(result).toContain('Available products for "acme"');
    expect(result).toContain('short             Short Name');
    expect(result).toContain('much-longer-slug  Long Slug Name');
  });

  it('should show usage example with packageName', () => {
    const products = [makeProduct({ slug: 'prod-a', name: 'Product A' })];
    const result = stripAnsi(formatProductHelp('acme', products));

    // Should use packageName (which is "vercel") rather than a hardcoded value
    expect(result).toContain('$ vercel integration add acme/<product-slug>');
  });

  it('should include Usage section', () => {
    const products = [makeProduct({ slug: 'prod-a', name: 'Product A' })];
    const result = stripAnsi(formatProductHelp('acme', products));

    expect(result).toContain('Usage:');
  });

  it('should use the integration slug in the header and usage example', () => {
    const products = [makeProduct({ slug: 'db', name: 'Database' })];
    const result = stripAnsi(formatProductHelp('my-integration', products));

    expect(result).toContain('Available products for "my-integration"');
    expect(result).toContain('my-integration/<product-slug>');
  });
});
