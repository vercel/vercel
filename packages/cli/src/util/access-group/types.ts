// Wire shapes for the public Access Groups API (v1). Mirrors the AccessGroup
// DTO returned by the read/list endpoints. Timestamps are unix-ms encoded as
// strings.
export interface AccessGroup {
  accessGroupId: string;
  name: string;
  teamId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  membersCount: number;
  projectsCount: number;
  teamRoles?: string[];
  teamPermissions?: string[];
  // Sideloaded by the read endpoint (and the list endpoint when requested):
  entitlements?: string[];
  isDsyncManaged?: boolean;
  // Present only when the list is scoped to a project.
  role?: string;
}

export interface AccessGroupsPagination {
  count?: number;
  next?: string | null;
}

export interface ListAccessGroupsResponse {
  accessGroups: AccessGroup[];
  pagination?: AccessGroupsPagination;
}

export interface AccessGroupMember {
  uid: string;
  email?: string;
  username?: string;
  name?: string;
  teamRole?: string;
  createdAt?: string;
}

export interface ListAccessGroupMembersResponse {
  members: AccessGroupMember[];
  pagination?: AccessGroupsPagination;
}
