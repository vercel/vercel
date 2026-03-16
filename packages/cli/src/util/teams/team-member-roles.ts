export const TEAM_MEMBER_ROLES = [
  'OWNER',
  'MEMBER',
  'DEVELOPER',
  'SECURITY',
  'BILLING',
  'VIEWER',
  'VIEWER_FOR_PLUS',
  'CONTRIBUTOR',
] as const;

export type TeamMemberRole = (typeof TEAM_MEMBER_ROLES)[number];

export const TEAM_MEMBER_ROLE_LIST = TEAM_MEMBER_ROLES.join(', ');

export function isTeamMemberRole(role: string): role is TeamMemberRole {
  return TEAM_MEMBER_ROLES.includes(role as TeamMemberRole);
}
