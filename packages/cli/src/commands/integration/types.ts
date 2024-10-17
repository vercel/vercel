export interface MetadataSchemaProperty {
  type: 'string' | 'number' | string;
  description?: string;
  default?: string;
  minimum?: number;
  maximum?: number;
  'ui:control': 'input' | 'select' | 'vercel-region' | string;
  'ui:disabled'?: boolean;
  'ui:hidden'?: 'create' | boolean | string;
  'ui:label'?: string;
  'ui:placeholder'?: string;
  'ui:options'?:
    | string[]
    | {
        label: string;
        value: string;
        hidden?: boolean;
      }[];
  'ui:read-only'?: boolean;
}

export type Metadata = Record<string, string | number | undefined>;
export type MetadataEntry = Readonly<[string, Metadata[string]]>;

export interface MetadataSchema {
  type: 'object';
  properties: Record<string, MetadataSchemaProperty>;
  required?: string[];
}

export interface IntegrationProduct {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  type: 'storage' | string;
  metadataSchema: MetadataSchema;
}

export type InstallationType = 'marketplace' | 'external';

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
}

export interface IntegrationInstallation {
  id: string;
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

export interface Resource {
  id: string;
  type: string;
  name: string;
  status?: string | null;
  product?: {
    name?: string;
    slug?: string;
    integrationConfigurationId?: string;
  };
  projectsMetadata?: ResourceConnection[];
}

export interface ResourceConnection {
  id: string;
  projectId: string;
  name: string;
  environments: string[];
}
