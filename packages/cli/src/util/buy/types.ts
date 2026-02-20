import type { CreditType, AddonAlias } from '../../commands/buy/command';

export type PurchaseItem =
  | { type: 'credits'; creditType: CreditType; amount: number }
  | { type: 'addon'; productAlias: AddonAlias; quantity: number }
  | { type: 'pro' }
  | { type: 'v0' };

export interface BuyResponse {
  purchaseIntent?: {
    id: string;
    status: string;
  };
  subscriptionIntent?: {
    id: string;
    status: string;
  };
}
