export interface ConnexClient {
  id: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  uid: string;
  type: string;
  name: string;
  clientUrl?: string | null;
  data: object;
  typeName: string;
  typeIcon?: string;
  website?: string;
  devsite?: string;
  docsite?: string;
  icon?: string;
  supportedSubjectTypes: Array<'user' | 'app'>;
  supportsInstallation: boolean;
}

export interface ConnexClientIdentity {
  id: string;
  uid: string;
  name?: string;
  supportsTriggers?: boolean;
  triggers?: { enabled: boolean };
  triggerDestinations?: ConnexTriggerDestination[];
}

export interface ConnexTriggerDestination {
  projectId: string;
  branch?: string;
  path?: string;
}

export interface ConnexClientProject {
  clientId: string;
  projectId: string;
  environments?: string[];
  project?: { id: string; name: string };
}

export interface ConnexClientProjectListResponse {
  projects: ConnexClientProject[];
  cursor?: string;
}
