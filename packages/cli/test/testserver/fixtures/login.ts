import { randomUUID } from 'node:crypto';
import type { Factories } from '../factories/types';
import type { Authenticator } from './authenticator';

// Port of vercel/front tooling/playwright/src/test/fixtures/login.ts (at
// 185cfac41a9). Differences: the team gets a known slug when none is passed
// (the CLI needs one for `--scope`), and the result includes the token.

export type TeamRole =
  | 'OWNER'
  | 'MEMBER'
  | 'DEVELOPER'
  | 'SECURITY'
  | 'VIEWER'
  | 'VIEWER_FOR_PLUS'
  | 'BILLING'
  | 'CONTRIBUTOR';

const BILLING_ADDRESS = {
  line1: '340 S Lemon Ave',
  city: 'Walnut',
  state: 'CA',
  postalCode: '91789',
  country: 'US',
};

export interface LoginOptions {
  plan?: 'hobby' | 'pro' | 'enterprise';
  role?: TeamRole;
  withProject?: boolean | Partial<Factories.Project>;
  user?: Partial<Factories.User>;
  team?: Partial<Factories.Team>;
}

export interface LoginResult {
  user: Factories.User;
  team: Factories.Team;
  token: Factories.Token;
  project?: Factories.Project;
}

export type LoginFixture = (options?: LoginOptions) => Promise<LoginResult>;

export function createLogin(
  factories: Factories,
  authenticator: Authenticator
): LoginFixture {
  return async function login({
    plan = 'pro',
    role = 'OWNER',
    withProject = false,
    user: userOverrides = {},
    team: teamOverrides = {},
  }: LoginOptions = {}): Promise<LoginResult> {
    const unique = randomUUID();
    const userId = userOverrides.id ?? `user_${unique}`;
    const teamId = teamOverrides.id ?? `team_${unique}`;

    const user = await factories.users.build({
      ...userOverrides,
      id: userId,
      email: userOverrides.email ?? `${unique}@example.com`,
      defaultTeamId: teamId,
    });

    let creatorId = user.id;
    const members: NonNullable<Factories.Team['members']> = [];

    if (role !== 'OWNER') {
      const creator = await factories.users.build({
        email: `${randomUUID()}@example.com`,
      });
      creatorId = creator.id;
      members.push({ uid: creator.id, role: 'OWNER', confirmed: true });
    }

    members.push({
      uid: user.id,
      role: role as NonNullable<Factories.Team['members']>[number]['role'],
      confirmed: true,
    });

    const team = await factories.teams.build({
      ...teamOverrides,
      id: teamId,
      slug: teamOverrides.slug ?? `team-${unique.slice(0, 8)}`,
      creatorId,
      billing: {
        ...teamOverrides.billing,
        plan,
        period: plan === 'pro' ? 'monthly' : null,
        address: {
          ...BILLING_ADDRESS,
          ...teamOverrides.billing?.address,
        },
      },
      members,
    });

    const project = withProject
      ? await factories.projects.build({
          ...(typeof withProject === 'object' ? withProject : {}),
          accountId: team.id,
        })
      : undefined;

    const token = await authenticator.withTeam(user, team);

    return { user, team, token, project };
  };
}
