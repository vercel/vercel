export interface MetadataSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | string;
  description?: string;
  default?: string | boolean | number;
  minimum?: number;
  maximum?: number;
  items?: { type: 'string' | 'number' | string };
  'ui:control': 'input' | 'select' | 'vercel-region' | string;
  'ui:disabled'?: 'create' | Expression | boolean | string;
  'ui:hidden'?: 'create' | Expression | boolean | string;
  'ui:label'?: string;
  'ui:placeholder'?: string;
  'ui:options'?:
    | string[]
    | {
        label: string;
        value: string;
        hidden?: boolean;
      }[];
  'ui:read-only'?: 'create' | Expression | boolean | string;
}

interface Expression {
  expr: string;
}

export type Metadata = Record<
  string,
  string | number | boolean | string[] | number[] | undefined
>;
export interface MetadataSchema {
  type: 'object';
  properties: Record<string, MetadataSchemaProperty>;
  required?: string[];
}

type IntegrationProductProtocolBase = {
  status: 'enabled' | 'disabled';
};

type StorageIntegrationProtocol = IntegrationProductProtocolBase & {
  repl?: {
    enabled: boolean;
    supportsReadOnlyMode: boolean;
    welcomeMessage?: string;
  };
};

type VideoIntegrationProtocol = IntegrationProductProtocolBase;

interface IntegrationGuideStep {
  title: string;
  content: string;
  actions?: { type: string }[];
}

export interface IntegrationGuide {
  framework: string;
  title: string;
  steps: IntegrationGuideStep[];
}

export interface IntegrationSnippet {
  name: string;
  language: string;
  content: string;
}

export interface IntegrationResourceLink {
  title: string;
  href: string;
}

export interface IntegrationProduct {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  type?: 'storage' | string;
  protocols?: {
    storage?: StorageIntegrationProtocol;
    video?: VideoIntegrationProtocol;
  };
  metadataSchema: MetadataSchema;
  guides?: IntegrationGuide[];
  snippets?: IntegrationSnippet[];
  resourceLinks?: IntegrationResourceLink[];
}

type InstallationType = 'marketplace' | 'external';

export interface Configuration {
  id: string;
  integrationId: string;
  ownerId: string;
  slug: string;
  teamId: string;
  userId: string;
  scopes: string[];
  source: string;
  installationType: InstallationType;
  projects: string[];
}

export interface Integration {
  id: string;
  slug: string;
  name: string;
  products?: IntegrationProduct[];
  /** Integration-level metadata schema (e.g. org name, region for Sentry). */
  metadataSchema?: MetadataSchema;
  eulaDocUri?: string;
  privacyDocUri?: string;
  capabilities?: {
    requiresBrowserInstall?: boolean;
  };
}

export interface IntegrationInstallation {
  id: string;
  integrationId: string;
  installationType: InstallationType;
  ownerId: string;
}

export interface BillingPlan {
  id: string;
  type: string;
  name: string;
  scope: 'resource' | 'installation';
  cost?: string;
  description: string;
  paymentMethodRequired: boolean;
  minimumAmount?: string;
  maximumAmount?: string;
  details: {
    label: string;
    value?: string;
  }[];
  highlightedDetails?: {
    label: string;
    value?: string;
  }[];
  disabled?: boolean;
}

export interface InstallationBalancesAndThresholds {
  ownerId: string;
  installationId: string;
  balances: CreditWithAmount[];
  thresholds: PrepaymentCreditThreshold[];
}

export interface CreditWithAmount {
  resourceId?: string;
  timestamp: string;
  credit?: string;
  nameLabel?: string;
  currencyValueInCents: number;
}

export interface PrepaymentCreditThreshold {
  resourceId?: string;
  minimumAmountInCents: number;
  billingPlanId: string;
  metadata?: string;
  purchaseAmountInCents: number;
  maximumAmountPerPeriodInCents?: number;
}

// Auto-provision types

export type AcceptedPolicies = Partial<
  Record<'toc' | 'privacy' | 'eula', string>
>;

interface AutoProvisionIntegration {
  id: string;
  slug: string;
  name: string;
  icon: string;
  policies: {
    eula?: string; // URL to EULA doc
    privacy?: string; // URL to privacy doc
  };
}

interface AutoProvisionProduct {
  id: string;
  slug: string;
  name: string;
  icon: string;
  iconBackgroundColor?: string;
  metadataSchema: MetadataSchema;
}

interface AutoProvisionResource {
  id: string;
  externalResourceId: string;
  name: string;
  status: string;
  ownership?: unknown;
  secretKeys?: string[];
}

export interface AutoProvisionedResponse {
  kind: 'provisioned';
  integration: AutoProvisionIntegration;
  product: AutoProvisionProduct;
  installation: { id: string };
  resource: AutoProvisionResource;
  billingPlan: BillingPlan | null;
}

interface AutoProvisionInstallationInfo {
  id: string;
  type?: 'marketplace' | 'external';
  externalId?: string;
  status?: string;
}

export interface AutoProvisionFallback {
  kind: string;
  reason?: string;
  error_message?: string;
  url: string;
  integration: AutoProvisionIntegration;
  product: AutoProvisionProduct;
  installation?: { id: string };
  installations?: AutoProvisionInstallationInfo[];
}

export type AutoProvisionResult =
  | AutoProvisionedResponse
  | AutoProvisionFallback;
