import type {
  CreditType,
  AddonAlias,
  PlanSlug,
} from '../../commands/buy/command';

export type PurchaseItem =
  | { type: 'credits'; creditType: CreditType; amount: number }
  | { type: 'addon'; productAlias: AddonAlias; quantity: number }
  | { type: 'subscription'; planSlug: PlanSlug };

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
