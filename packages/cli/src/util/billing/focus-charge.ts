/**
 * FOCUS v1.3 specification types for billing charges.
 * These types match the API response from /v1/billing/charges.
 * @see https://focus.finops.org/focus-specification/v1-3/
 *
 * Note: These types are copied from @api/billing-types which is a private
 * internal package. If the API types change, these should be updated.
 */

/**
 * Highest-level classification of a charge based on how it is billed.
 * @see https://focus.finops.org/focus-specification/v1-3/#chargecategory
 */
export type FocusChargeCategory =
  | 'Adjustment'
  | 'Credit'
  | 'Purchase'
  | 'Tax'
  | 'Usage';

/**
 * Pricing model used for the charge.
 * @see https://focus.finops.org/focus-specification/v1-3/#pricingcategory
 */
export type FocusPricingCategory =
  | 'Standard'
  | 'Dynamic'
  | 'Committed'
  | 'Other';

/**
 * High-level classification of the service a charge is associated with.
 * @see https://focus.finops.org/focus-specification/v1-3/#servicecategory
 */
export type FocusServiceCategory =
  | 'AI and Machine Learning'
  | 'Analytics'
  | 'Business Applications'
  | 'Compute'
  | 'Databases'
  | 'Developer Tools'
  | 'Multicloud'
  | 'Identity'
  | 'Integration'
  | 'Internet of Things'
  | 'Management and Governance'
  | 'Media'
  | 'Migration'
  | 'Mobile'
  | 'Networking'
  | 'Security'
  | 'Storage'
  | 'Web'
  | 'Other';

/**
 * Pricing information for the charge.
 * @see https://focus.finops.org/focus-specification/v1-3/#pricingcategory
 */
export interface FocusPricing {
  PricingCategory: FocusPricingCategory;
  PricingCurrency: 'USD';
  PricingQuantity: number;
  PricingUnit: string;
}

/**
 * Base FOCUS v1.3 representation of charges.
 * @see https://focus.finops.org/focus-specification/v1-3/
 */
export interface BaseFocusCharge {
  /** Charge amount serving as the basis for invoicing */
  BilledCost: number;
  /** Currency used for billing (ISO 4217) */
  BillingCurrency: 'USD';
  /** Classification of the charge */
  ChargeCategory: FocusChargeCategory;
  /** Inclusive start of the charge period (ISO 8601 UTC) */
  ChargePeriodStart: string;
  /** Exclusive end of the charge period (ISO 8601 UTC) - Required in v1.3 */
  ChargePeriodEnd: string;
  /** Volume of resource consumed */
  ConsumedQuantity: number;
  /** Unit of measurement for consumed quantity */
  ConsumedUnit: string;
  /** Amortized cost representation including discounts, pre-commitment credit purchase amount, etc. */
  EffectiveCost: number;
  /** Provider-assigned region identifier */
  RegionId: string | undefined;
  /** Display name for the region */
  RegionName: string | undefined;
  /** Display name for the service/product */
  ServiceName: string;
  /** High-level category of the service */
  ServiceCategory: FocusServiceCategory | undefined;
  /** Entity making the resource/service available for purchase (v1.3) */
  ServiceProviderName: string;
  /** Custom key-value metadata (ProjectId, ProjectName) */
  Tags: Record<string, string>;
}

/**
 * Extension of the base schema for Focus charges.
 * Includes pricing information for all customers.
 */
export interface FocusCharge extends BaseFocusCharge, FocusPricing {}
