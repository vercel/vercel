import type Client from '../client';
import type { BuyResponse, PurchaseItem } from './types';

/**
 * Create a purchase via the billing buy API. All buy flows (credits, addon, pro,
 * v0, etc.) use the same endpoint and return the same purchase intent shape;
 * the request body `item` varies by product.
 */
export async function createPurchase(
  client: Client,
  item: PurchaseItem
): Promise<BuyResponse> {
  return client.fetch<BuyResponse>('/v1/billing/buy', {
    method: 'POST',
    body: { item },
  });
}
