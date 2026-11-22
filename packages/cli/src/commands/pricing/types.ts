export const PLANS = ['hobby', 'pro', 'enterprise'] as const;

export type Plan = (typeof PLANS)[number];

export type PlanAvailability = {
  available: boolean;
  value: string;
};

export type Feature = {
  name: string;
  slug: string;
  section: string;
  category: string;
  /** True when the row came from a table with no Feature column. */
  standalone: boolean;
  description: string | null;
  values: Record<Plan, string>;
  available: Record<Plan, boolean>;
  minPlan: Plan;
};

export type TeamPlanInfo = {
  id: string | null;
  slug: string;
  name: string;
  plan: string;
  normalizedPlan: Plan | null;
};

export type PricingResult = {
  plan: string | null;
  team: TeamPlanInfo | null;
  source: string;
  query: string | null;
  summary: {
    total: number;
    matched: number;
    availableOnCurrentPlan: number | null;
    unavailableOnCurrentPlan: number | null;
    hobby: number;
    pro: number;
    enterprise: number;
  };
  features: Record<Plan, FeatureWithCurrentPlan[]>;
};

export type FeatureWithCurrentPlan = Feature & {
  availableOnCurrentPlan: boolean | null;
};
