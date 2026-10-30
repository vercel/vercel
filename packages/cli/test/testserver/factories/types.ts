// Factory types for the entities the CLI tests seed. `User`, `Team` and
// `Token` are copied verbatim from vercel/front
// packages/testing-factories/src/factories/{user,team,token}.ts at
// 185cfac41a9. Add more entity types (domains, aliases, ...) with the first
// tests that use them.

interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  secondaryEmails?: {
    email: string;
    verified: boolean;
  }[];
  defaultTeamId?: string;
  avatar?: string;
  isEnterpriseManaged?: boolean;
  // Set when the account is missing a required auth scope (e.g. SAML). The
  // dashboard reads this to force re-authentication before continuing.
  limited?: boolean;
  // The Git provider the new-project/clone flow pre-selects for the user.
  importFlowGitProvider?: 'github' | 'github-limited' | 'gitlab' | 'bitbucket';
  // References to credentials in Cosmos (e.g. GitHub OAuth).
  credentials?: {
    id: string;
    type:
      | 'bitbucket'
      | 'gitlab'
      | 'github-oauth'
      | 'github-oauth-custom-host'
      | 'github-oauth-limited'
      | 'custom'
      | 'vercel';
  }[];
  dismissedToasts?: {
    name: string;
    dismissals: {
      scopeId: string;
      createdAt: number;
    }[];
  }[];
}

interface Team {
  id: string;
  name: string;
  slug: string;
  creatorId: string;
  customerId?: string;
  billing?: {
    plan: string;
    period: string | null;
    status?: string;
    planIteration?: string;
    orbCustomerId?: string;
    address?: {
      line1?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
    invoiceItems?: Record<
      string,
      {
        price: number;
        quantity: number;
        highestQuantity?: number;
      }
    >;
  };
  /**
   * Observability Plus enablement state, read by
   * `GET /v1/observability/manage/configuration`. A team with `enabledAt` set
   * and no open interval in `disabledIntervals` is both enabled and
   * subscribed.
   */
  observability?: {
    enabledAt?: number;
    disabledIntervals?: { start: number; end?: number }[];
    disabledProjects: { id: string; disabledAt: number }[];
  };
  members?: {
    role:
      | 'OWNER'
      | 'MEMBER'
      | 'VIEWER'
      | 'DEVELOPER'
      | 'BILLING'
      | 'CONTRIBUTOR';
    created?: number;
    createdAt?: number;
    confirmed: true;
    uid: string;
  }[];
}

interface Token {
  id: string;
  secretString: string;
  uid: string;
  teamId?: string;
  origin?: string;
  scopes?: {
    type: 'user' | 'team';
    origin?: 'email' | 'saml' | 'otp' | 'github' | string;
    teamId?: string;
    createdAt?: number;
  }[];
}

/**
 * Minimal project shape. Front's full type is in
 * packages/testing-factories/src/factories/project.ts.
 */
interface Project {
  id: string;
  name: string;
  accountId: string;
  [key: string]: unknown;
}

export namespace Factories {
  export type User = _User;
  export type Team = _Team;
  export type Token = _Token;
  export type Project = _Project;
}

type _User = User;
type _Team = Team;
type _Token = Token;
type _Project = Project;

export interface Factory<
  T = Record<string, unknown>,
  O = Record<string, unknown>,
> {
  build: (data?: Partial<T>, options?: O) => Promise<T>;
}

export interface Factories {
  external: (path: string) => Record<string, Factory>;
  users: Factory<Factories.User>;
  teams: Factory<Factories.Team>;
  tokens: Factory<Factories.Token> & {
    tokens: Factory<Factories.Token>;
  };
  projects: Factory<Factories.Project>;
}
