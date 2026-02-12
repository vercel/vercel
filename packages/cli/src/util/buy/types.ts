import type { CreditType } from '../../commands/buy/command';

export type PurchaseItem =
  | { type: 'credits'; creditType: CreditType; amount: number }
  | { type: 'addon'; addonName: string }
  | { type: 'pro' }
  | { type: 'v0' };

export interface BuyResponse {
  purchaseIntent: {
    id: string;
    status: string;
  };
}
