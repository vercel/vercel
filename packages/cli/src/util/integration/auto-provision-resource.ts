import type Client from '../client';
import type { Metadata } from './types';

export interface AutoProvisionRequest {
  integrationIdOrSlug: string;
  productIdOrSlug: string;
  name: string;
  metadata?: Metadata;
  acceptedPolicies?: Record<string, string>;
  source?: string;
  billingPlanId?: string;
  authorizationId?: string;
  projectId?: string;
  environments?: ('production' | 'preview' | 'development')[];
}

interface MappedIntegration {
  id: string;
  slug: string;
  name: string;
  icon: string;
  policies: {
    eula?: string;
    privacy?: string;
  };
}

interface MappedProduct {
  id: string;
  slug: string;
  name: string;
  icon: string;
  iconBackgroundColor?: string;
  metadataSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface MappedInstallation {
  id: string;
}

interface MappedResource {
  id: string;
  externalResourceId: string;
  name: string;
  status: string;
  ownership?: unknown;
  secretKeys?: string[];
}

interface BillingPlan {
  id: string;
  name: string;
  cost?: string;
  type?: string;
  description?: string;
  paymentMethodRequired?: boolean;
  preauthorizationAmount?: number;
  details?: { label: string; value?: string }[];
  highlightedDetails?: { label: string; value?: string }[];
  disabled?: boolean;
}

interface BaseStep {
  url: string;
  integration: MappedIntegration;
  product: MappedProduct;
}

export interface InstallStep extends BaseStep {
  kind: 'install';
}

export interface MetadataStep extends BaseStep {
  kind: 'metadata';
}

export interface UnknownStep extends BaseStep {
  kind: 'unknown';
  installation?: MappedInstallation;
}

export interface PlanSelectionStep {
  kind: 'plan_selection';
  integration: MappedIntegration;
  product: MappedProduct;
  installation: MappedInstallation;
  plans: BillingPlan[];
  recommendedPlanId?: string;
}

export interface PaymentRequiredStep {
  kind: 'payment_required';
  integration: MappedIntegration;
  product: MappedProduct;
  installation: MappedInstallation;
  billingPlan: BillingPlan;
}

export interface RequiresActionStep {
  kind: 'requires_action';
  integration: MappedIntegration;
  product: MappedProduct;
  installation: MappedInstallation;
  authorizationId: string;
  billingPlan: BillingPlan;
  paymentIntent?: { clientSecret?: string | null };
}

export interface ProvisionedResponse {
  kind: 'provisioned';
  integration: MappedIntegration;
  product: MappedProduct;
  installation: MappedInstallation;
  resource: MappedResource;
  billingPlan: BillingPlan | null;
}

export type AutoProvisionResponse =
  | ProvisionedResponse
  | InstallStep
  | MetadataStep
  | UnknownStep
  | PlanSelectionStep
  | PaymentRequiredStep
  | RequiresActionStep;

export async function autoProvisionResource(
  client: Client,
  request: AutoProvisionRequest
): Promise<AutoProvisionResponse> {
  const {
    integrationIdOrSlug,
    productIdOrSlug,
    name,
    metadata,
    acceptedPolicies,
    source,
    billingPlanId,
    authorizationId,
    projectId,
    environments,
  } = request;

  const response = await client.fetch<AutoProvisionResponse>(
    `/v1/marketplace/auto-provision-resource?integrationIdOrSlug=${encodeURIComponent(integrationIdOrSlug)}&productIdOrSlug=${encodeURIComponent(productIdOrSlug)}`,
    {
      method: 'POST',
      json: true,
      body: {
        name,
        ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
        ...(acceptedPolicies ? { acceptedPolicies } : {}),
        ...(source ? { source } : {}),
        ...(billingPlanId ? { billingPlanId } : {}),
        ...(authorizationId ? { authorizationId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(environments?.length ? { environments } : {}),
      },
    }
  );

  return response;
}
