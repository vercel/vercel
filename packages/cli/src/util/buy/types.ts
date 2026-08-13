import type {
  CreditType,
  BillingBuyAddonAlias,
} from '../../commands/buy/command';

export type PurchaseItem =
  | { type: 'credits'; creditType: CreditType; amount: number }
  | { type: 'addon'; productAlias: BillingBuyAddonAlias; quantity: number }
  | { type: 'subscription'; planSlug: 'pro' }
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
