export interface Account {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'active' | 'invited' | 'suspended';
  joinedAt: string;
  lastActiveAt?: string;
  avatar?: string;
  permissions?: string[];
}

export interface AccountListResponse {
  accounts: Account[];
  pagination: {
    total: number;
    page: number;
    perPage: number;
    hasMore: boolean;
  };
}

export interface AccountDetailsResponse {
  account: Account;
  activity?: {
    deployments: number;
    projects: number;
    lastDeploy?: string;
  };
  teams?: {
    id: string;
    name: string;
    role: string;
  }[];
}

export interface AccountFilters {
  role?: string;
  status?: string;
  search?: string;
  sortBy?: 'name' | 'email' | 'joinedAt' | 'lastActiveAt';
  sortOrder?: 'asc' | 'desc';
}
