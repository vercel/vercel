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

export class CancelledError extends Error {}
export class FailedError extends Error {}
