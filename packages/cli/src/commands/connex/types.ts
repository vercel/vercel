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

/**
 * A Secure Compute network (referred to as a "configuration" internally).
 * Mirrors the public `GET /v1/connect/networks[/:id]` response shape. The
 * private `teamPrincipalRoleArn` field is intentionally omitted here so it is
 * never surfaced through the CLI.
 */
export interface ConnexNetwork {
  id: string;
  name: string;
  cidr: string;
  status: 'create_in_progress' | 'ready' | 'delete_in_progress';
  /** Vercel region (data center) identifier, e.g. `iad1`. */
  region?: string;
  awsRegion: string;
  awsAccountId: string;
  awsAvailabilityZoneIds?: string[];
  vpcId?: string;
  egressIpAddresses?: string[];
  egressCidrBlock?: string;
  createdAt: number;
  teamId: string;
  hostedZones?: { count: number };
  peeringConnections?: { count: number };
  projects?: { count: number; ids: string[] };
}
