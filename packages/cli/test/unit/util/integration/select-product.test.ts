import { describe, expect, it, vi } from 'vitest';
import { selectProduct } from '../../../../src/util/integration/select-product';
import type { IntegrationProduct } from '../../../../src/util/integration/types';
import { client } from '../../../mocks/client';

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

describe('selectProduct', () => {
  describe('with productSlug', () => {
    it('should return matching product', async () => {
      const products = [
        makeProduct({ slug: 'kv', name: 'KV Store' }),
        makeProduct({ slug: 'redis', name: 'Redis' }),
      ];
      const result = await selectProduct(client, products, 'redis');
      expect(result).toEqual(products[1]);
    });

    it('should return undefined and print error when slug not found', async () => {
      const products = [makeProduct({ slug: 'kv', name: 'KV Store' })];
      const result = await selectProduct(client, products, 'nope');
      expect(result).toBeUndefined();
      expect(client.stderr.getFullOutput()).toContain(
        'Product "nope" not found'
      );
      expect(client.stderr.getFullOutput()).toContain('Available products: kv');
    });

    it('should list all available slugs when slug not found', async () => {
      const products = [
        makeProduct({ slug: 'a', name: 'A' }),
        makeProduct({ slug: 'b', name: 'B' }),
        makeProduct({ slug: 'c', name: 'C' }),
      ];
      const result = await selectProduct(client, products, 'z');
      expect(result).toBeUndefined();
      expect(client.stderr.getFullOutput()).toContain(
        'Available products: a, b, c'
      );
    });
  });

  describe('without productSlug', () => {
    it('should auto-select when only one product', async () => {
      const products = [makeProduct({ slug: 'only', name: 'Only Product' })];
      const result = await selectProduct(client, products);
      expect(result).toEqual(products[0]);
    });

    it('should prompt when multiple products', async () => {
      const products = [
        makeProduct({ slug: 'a', name: 'Product A' }),
        makeProduct({ slug: 'b', name: 'Product B' }),
      ];

      // Mock the interactive select to return the second product
      const selectSpy = vi
        .spyOn(client.input, 'select')
        .mockResolvedValueOnce(products[1]);

      const result = await selectProduct(client, products);
      expect(result).toEqual(products[1]);
      expect(selectSpy).toHaveBeenCalledWith({
        message: 'Select a product',
        choices: [
          {
            name: 'Product A',
            value: products[0],
            description: '',
          },
          {
            name: 'Product B',
            value: products[1],
            description: '',
          },
        ],
      });

      selectSpy.mockRestore();
    });
  });
});
