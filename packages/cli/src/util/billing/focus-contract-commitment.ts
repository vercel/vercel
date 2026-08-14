/**
 * FOCUS v1.3 specification types for contract commitments.
 * These types match the API response from /v1/billing/contract-commitments.
 * @see https://focus.finops.org/focus-specification/v1-3/
 *
 * Note: These types are copied from @api/billing-types which is a private
 * internal package. If the API types change, these should be updated.
 */

/**
 * Currency used for billing (ISO 4217).
 * @see https://focus.finops.org/focus-specification/v1-3/#billingcurrency
 */
export interface FocusContractBilling {
  BillingCurrency: string;
}

/**
 * Highest-level classification of a contract commitment.
 * @see https://focus.finops.org/focus-specification/v1-3/#contractcommitmentcategory
 */
export type FocusContractCommitmentCategory = 'Spend' | 'Usage';

/**
 * Contract information linking charges to contractual agreements.
 * New in FOCUS v1.3 - supplemental dataset for contract terms.
 * @see https://focus.finops.org/focus-specification/v1-3/#contractcommitments
 */
export interface FocusContract {
  /**
   * Service-provider-assigned identifier for a contract.
   * Maps to Orb Subscription ID for Vercel.
   */
  ContractId: string;
  /** Inclusive start of the overall contract period (ISO 8601 UTC) */
  ContractPeriodStart: string;
  /** Exclusive end of the overall contract period (ISO 8601 UTC) */
  ContractPeriodEnd: string;
}

/**
 * Contract commitment information describing terms within a contract.
 * New in FOCUS v1.3 - tracks commitment terms separate from cost/usage rows.
 *
 * For Vercel:
 * - Pro: $20 monthly spend commitment
 * - Enterprise: MIU allocation per period (usage commitment)
 *
 * @see https://focus.finops.org/focus-specification/v1-3/#contractcommitments
 */
export interface FocusContractCommitment
  extends FocusContract,
    FocusContractBilling {
  /**
   * Highest-level classification of the contract commitment.
   * 'Spend' for Pro ($20/month), 'Usage' for Enterprise (MIU allocation).
   */
  ContractCommitmentCategory: FocusContractCommitmentCategory;
  /**
   * Monetary value of the contract commitment (in BillingCurrency).
   * Required when ContractCommitmentCategory is 'Spend'.
   * For Pro: 20 (USD)
   */
  ContractCommitmentCost: number | undefined;
  /** Self-contained summary of the contract commitment's terms */
  ContractCommitmentDescription: string | undefined;
  /**
   * Unique identifier for a single contract term within a contract.
   * Maps to specific commitment period or allocation ID.
   */
  ContractCommitmentId: string;
  /** Inclusive start of the commitment term period (ISO 8601 UTC) */
  ContractCommitmentPeriodStart: string;
  /** Exclusive end of the commitment term period (ISO 8601 UTC) */
  ContractCommitmentPeriodEnd: string;
  /**
   * Amount associated with the commitment (in ContractCommitmentUnit).
   * Required when ContractCommitmentCategory is 'Usage'.
   * For Enterprise: MIU allocation amount.
   */
  ContractCommitmentQuantity: number | undefined;
  /**
   * Service-provider-assigned name identifying the commitment type.
   * 'Pro' or 'Enterprise' for Vercel.
   */
  ContractCommitmentType: string;
  /**
   * Measurement unit for ContractCommitmentQuantity.
   * 'MIUs' for Enterprise, 'USD' for Pro spend commitments.
   */
  ContractCommitmentUnit: string;
}
