import { client } from './client';
import type {
  AccessGroup,
  AccessGroupMember,
  AccessGroupProject,
} from '../../src/util/access-group/types';

export const defaultAccessGroup: AccessGroup = {
  accessGroupId: 'ag_1',
  name: 'engineering',
  teamId: 'team_dummy',
  createdAt: '1600000000000',
  updatedAt: '1600000000000',
  membersCount: 3,
  projectsCount: 2,
  teamRoles: ['DEVELOPER'],
  teamPermissions: ['CreateProject'],
};

// Registers the happy-path list/read routes. Error cases register their own
// handlers instead of calling this.
export function useAccessGroups(
  accessGroups: AccessGroup[] = [defaultAccessGroup]
) {
  client.scenario.get('/v1/access-groups', (_req, res) => {
    res.json({
      accessGroups,
      pagination: { count: accessGroups.length, next: null },
    });
  });

  for (const accessGroup of accessGroups) {
    client.scenario.get(
      `/v1/access-groups/${accessGroup.accessGroupId}`,
      (_req, res) => {
        res.json(accessGroup);
      }
    );
    client.scenario.get(
      `/v1/access-groups/${accessGroup.name}`,
      (_req, res) => {
        res.json(accessGroup);
      }
    );
  }

  return accessGroups;
}

export const defaultMember: AccessGroupMember = {
  uid: 'usr_1',
  email: 'jane@example.com',
  username: 'jane',
  name: 'Jane Doe',
  teamRole: 'MEMBER',
};

export function useAccessGroupMembers(
  group: string,
  members: AccessGroupMember[] = [defaultMember]
) {
  client.scenario.get(`/v1/access-groups/${group}/members`, (_req, res) => {
    res.json({ members, pagination: { count: members.length, next: null } });
  });
  return members;
}

export const defaultAccessGroupProject: AccessGroupProject = {
  projectId: 'prj_1',
  role: 'PROJECT_VIEWER',
  createdAt: '1600000000000',
  updatedAt: '1600000000000',
  project: {
    id: 'prj_1',
    name: 'my-project',
    framework: 'nextjs',
  },
};

export function useAccessGroupProjects(
  group: string,
  projects: AccessGroupProject[] = [defaultAccessGroupProject]
) {
  client.scenario.get(`/v1/access-groups/${group}/projects`, (_req, res) => {
    res.json({ projects, pagination: { count: projects.length, next: null } });
  });
  return projects;
}
