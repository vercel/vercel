import output from '../../output-manager';
import type Client from '../client';
import type { IntegrationProduct } from './types';

/**
 * Select a product by slug, auto-select if only one, or prompt interactively.
 * Callers must ensure `products` is non-empty before calling.
 * Returns `undefined` if the specified slug doesn't match any product.
 */
export async function selectProduct(
  client: Client,
  products: IntegrationProduct[],
  productSlug?: string
): Promise<IntegrationProduct | undefined> {
  if (productSlug) {
    const match = products.find(p => p.slug === productSlug);
    if (!match) {
      const available = products.map(p => p.slug).join(', ');
      output.error(
        `Product "${productSlug}" not found. Available products: ${available}`
      );
      return;
    }
    return match;
  }

  if (products.length === 1) {
    return products[0];
  }

  return client.input.select({
    message: 'Select a product',
    choices: products.map(p => ({
      name: p.name,
      value: p,
      description: p.shortDescription,
    })),
  });
}
