export interface ConnexClient {
  id: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  uid: string;
  type: string;
  /** Third-party service this connector represents, e.g. `notion`. */
  service?: string;
  /** Registry connection method the connector was created from, when named. */
  connectionMethod?: string;
  /** Which of the service's products/surfaces the connector points at. */
  target?: string;
  name: string;
  clientUrl?: string | null;
  data: object;
  typeName: string;
  typeIcon?: string;
  website?: string;
  devsite?: string;
  docsite?: string;
  icon?: string | null;
  backgroundColor?: string | null;
  accentColor?: string | null;
  supportedSubjectTypes: Array<'user' | 'app'>;
  supportsInstallation: boolean;
}

export interface ConnexClientIdentity {
  id: string;
  uid: string;
  name?: string;
  supportsRevocation?: boolean;
  supportsTriggers?: boolean;
  triggers?: { enabled: boolean };
  triggerDestinations?: ConnexTriggerDestination[];
}

export interface ConnexTriggerDestination {
  projectId: string;
  customEnvironmentId?: string;
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
