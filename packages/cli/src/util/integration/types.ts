export interface MetadataSchemaProperty {
  type: 'string' | 'number' | string;
  description?: string;
  default?: string;
  minimum?: number;
  maximum?: number;
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

export interface Expression {
  expr: string;
}

export type Metadata = Record<string, string | number | undefined>;
export type MetadataEntry = Readonly<[string, Metadata[string]]>;

export interface MetadataSchema {
  type: 'object';
  properties: Record<string, MetadataSchemaProperty>;
  required?: string[];
}

export type IntegrationProductProtocolBase = {
  status: 'enabled' | 'disabled';
};

export type StorageIntegrationProtocol = IntegrationProductProtocolBase & {
  repl?: {
    enabled: boolean;
    supportsReadOnlyMode: boolean;
    welcomeMessage?: string;
  };
};

export interface IntegrationProduct {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  type?: 'storage' | string;
  protocols?: {
    storage?: StorageIntegrationProtocol;
  };
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
