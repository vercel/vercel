import { frameworkList, type Framework } from '@vercel/frameworks';
import type { Org } from '@vercel-internals/types';

function fw(slug: string): Framework {
  const f = frameworkList.find(x => x.slug === slug);
  if (!f) {
    throw new Error(`LINK_DEMO: framework "${slug}" not in @vercel/frameworks`);
  }
  return f;
}

/** Exported for tests — stable scenario ids for `LINK_DEMO=…`. */
export const LINK_DEMO_SCENARIO_IDS = [
  'monorepo-1',
  'monorepo-2',
  'simple-app',
  'only-new',
  'detected-multi',
  'misconfig-only',
  /** Single row: only a non-git-linked project (directory mismatch). */
  'non-git-only',
  /** Single row: one misconfigured root directory. */
  'sole-misconfigured',
  /** Two primary rows: git-linked + non-git (no detected / new projects). */
  'git-and-non-git',
] as const;

export type LinkDemoScenarioId = (typeof LINK_DEMO_SCENARIO_IDS)[number];

type GitLinkedProject = {
  type: 'gitLinkedProject';
  id: string;
  name: string;
  directory: string;
  orgId: string;
  framework: string | null | undefined;
};

type GitLinkedProjectWithMisconfiguredRootDirectory = {
  type: 'gitLinkedProjectWithMisconfiguredRootDirectory';
  id: string;
  name: string;
  directory: string;
  suggestedDirectory: string;
  framework: string | null | undefined;
  orgId: string;
  orgSlug: string;
  matchesFramework: boolean;
  matchesTeam: boolean;
  matchesRootDirectory: boolean;
  isLinkedToThisRepo: boolean;
};

type NonGitLinkedProject = {
  type: 'nonGitLinkedProject';
  id: string;
  name: string;
  directory: string;
  suggestedDirectory: string;
  framework: string | null | undefined;
  orgSlug: string;
  orgId: string;
  matchesFramework: boolean;
  matchesTeam: boolean;
  matchesRootDirectory: boolean;
  isLinkedToThisRepo: boolean;
};

export type LinkDemoPayload = {
  gitLinkedProjects: GitLinkedProject[];
  gitLinkedProjectsWithMisconfiguredRootDirectory: GitLinkedProjectWithMisconfiguredRootDirectory[];
  nonGitLinkedProjects: NonGitLinkedProject[];
  detectedProjects: Map<string, Framework[]>;
};

function demoGitLinked(
  org: Org,
  row: { name: string; directory: string; framework?: string | null }
): GitLinkedProject {
  return {
    type: 'gitLinkedProject',
    id: `demo-gl-${row.name}`,
    name: row.name,
    directory: row.directory,
    orgId: org.id,
    framework: row.framework ?? 'nextjs',
  };
}

function demoMisconfigured(
  org: Org,
  row: {
    name: string;
    directory: string;
    suggestedDirectory: string;
    framework: string | null;
  }
): GitLinkedProjectWithMisconfiguredRootDirectory {
  return {
    type: 'gitLinkedProjectWithMisconfiguredRootDirectory',
    id: `demo-mis-${row.name}`,
    name: row.name,
    directory: row.directory,
    suggestedDirectory: row.suggestedDirectory,
    framework: row.framework,
    orgId: org.id,
    orgSlug: org.slug,
    matchesFramework: true,
    matchesTeam: true,
    matchesRootDirectory: false,
    isLinkedToThisRepo: true,
  };
}

function demoNonGit(
  org: Org,
  row: {
    name: string;
    directory: string;
    suggestedDirectory: string;
    framework: string | null;
  }
): NonGitLinkedProject {
  return {
    type: 'nonGitLinkedProject',
    id: `demo-ng-${row.name}`,
    name: row.name,
    directory: row.directory,
    suggestedDirectory: row.suggestedDirectory,
    framework: row.framework,
    orgId: org.id,
    orgSlug: org.slug,
    matchesFramework: true,
    matchesTeam: true,
    matchesRootDirectory: false,
    isLinkedToThisRepo: false,
  };
}

function scenarioMonorepo1(org: Org): LinkDemoPayload {
  return {
    gitLinkedProjects: [
      demoGitLinked(org, { name: 'web-2', directory: 'apps/web-2' }),
      demoGitLinked(org, {
        name: 'api',
        directory: 'apps/api',
        framework: 'hono',
      }),
    ],
    gitLinkedProjectsWithMisconfiguredRootDirectory: [
      demoMisconfigured(org, {
        name: 'web-21',
        directory: '.',
        suggestedDirectory: 'apps/web-21',
        framework: 'nextjs',
      }),
      demoMisconfigured(org, {
        name: 'web-22',
        directory: 'packages/legacy',
        suggestedDirectory: '',
        framework: 'nextjs',
      }),
    ],
    nonGitLinkedProjects: [
      demoNonGit(org, {
        name: 'web-23',
        directory: 'apps/web-23',
        suggestedDirectory: 'apps/web-23',
        framework: 'nextjs',
      }),
    ],
    detectedProjects: new Map([['apps/web-24', [fw('nextjs')]]]),
  };
}

/**
 * Monorepo with no projects already git-linked on Vercel; one cross-team match
 * whose Vercel root is repo root (`""`) but local detection points at `apps/web`.
 */
function scenarioMonorepo2(org: Org): LinkDemoPayload {
  return {
    gitLinkedProjects: [],
    gitLinkedProjectsWithMisconfiguredRootDirectory: [],
    nonGitLinkedProjects: [
      demoNonGit(org, {
        name: 'dashboard',
        directory: '',
        suggestedDirectory: 'apps/web',
        framework: 'nextjs',
      }),
    ],
    detectedProjects: new Map([['apps/web', [fw('nextjs')]]]),
  };
}

function scenarioSimpleApp(org: Org): LinkDemoPayload {
  return {
    gitLinkedProjects: [
      demoGitLinked(org, {
        name: 'marketing',
        directory: '',
        framework: 'nextjs',
      }),
    ],
    gitLinkedProjectsWithMisconfiguredRootDirectory: [],
    nonGitLinkedProjects: [],
    detectedProjects: new Map(),
  };
}

/** Single detected root only (one “origin”), for minimal new-project UX. */
function scenarioOnlyNew(_org: Org): LinkDemoPayload {
  return {
    gitLinkedProjects: [],
    gitLinkedProjectsWithMisconfiguredRootDirectory: [],
    nonGitLinkedProjects: [],
    detectedProjects: new Map([['apps/site', [fw('nextjs')]]]),
  };
}

/** Multiple locally detected app roots only — no Vercel/API projects in the list. */
function scenarioDetectedMulti(_org: Org): LinkDemoPayload {
  return {
    gitLinkedProjects: [],
    gitLinkedProjectsWithMisconfiguredRootDirectory: [],
    nonGitLinkedProjects: [],
    detectedProjects: new Map([
      ['apps/web', [fw('nextjs')]],
      ['apps/api', [fw('hono')]],
      ['packages/widget', [fw('vite')]],
    ]),
  };
}

function scenarioMisconfigOnly(org: Org): LinkDemoPayload {
  return {
    gitLinkedProjects: [],
    gitLinkedProjectsWithMisconfiguredRootDirectory: [
      demoMisconfigured(org, {
        name: 'app-a',
        directory: 'apps/wrong',
        suggestedDirectory: 'apps/a',
        framework: 'nextjs',
      }),
      demoMisconfigured(org, {
        name: 'app-b',
        directory: '',
        suggestedDirectory: 'apps/b',
        framework: 'vite',
      }),
    ],
    nonGitLinkedProjects: [],
    detectedProjects: new Map(),
  };
}

/** Sole primary row: non-git project only (Vercel root vs suggested differ). */
function scenarioNonGitOnly(org: Org): LinkDemoPayload {
  return {
    gitLinkedProjects: [],
    gitLinkedProjectsWithMisconfiguredRootDirectory: [],
    nonGitLinkedProjects: [
      demoNonGit(org, {
        name: 'standalone-app',
        directory: '',
        suggestedDirectory: 'apps/web',
        framework: 'nextjs',
      }),
    ],
    detectedProjects: new Map(),
  };
}

/** Sole primary row: one misconfigured git-linked project. */
function scenarioSoleMisconfigured(org: Org): LinkDemoPayload {
  return {
    gitLinkedProjects: [],
    gitLinkedProjectsWithMisconfiguredRootDirectory: [
      demoMisconfigured(org, {
        name: 'solo-app',
        directory: 'legacy',
        suggestedDirectory: 'apps/solo',
        framework: 'nextjs',
      }),
    ],
    nonGitLinkedProjects: [],
    detectedProjects: new Map(),
  };
}

/** Git-linked row + non-git row; no local-only detected “new project” rows. */
function scenarioGitAndNonGit(org: Org): LinkDemoPayload {
  return {
    gitLinkedProjects: [
      demoGitLinked(org, {
        name: 'marketing',
        directory: 'apps/marketing',
        framework: 'nextjs',
      }),
    ],
    gitLinkedProjectsWithMisconfiguredRootDirectory: [],
    nonGitLinkedProjects: [
      demoNonGit(org, {
        name: 'api-server',
        directory: 'services/api',
        suggestedDirectory: 'services/api',
        framework: 'hono',
      }),
    ],
    detectedProjects: new Map(),
  };
}

const SCENARIOS: Record<LinkDemoScenarioId, (org: Org) => LinkDemoPayload> = {
  'monorepo-1': scenarioMonorepo1,
  'monorepo-2': scenarioMonorepo2,
  'simple-app': scenarioSimpleApp,
  'only-new': scenarioOnlyNew,
  'detected-multi': scenarioDetectedMulti,
  'misconfig-only': scenarioMisconfigOnly,
  'non-git-only': scenarioNonGitOnly,
  'sole-misconfigured': scenarioSoleMisconfigured,
  'git-and-non-git': scenarioGitAndNonGit,
};

export function getLinkDemoScenarioIds(): LinkDemoScenarioId[] {
  return [...LINK_DEMO_SCENARIO_IDS];
}

export function buildLinkDemoPayload(
  scenarioId: string,
  org: Org
): LinkDemoPayload {
  const fn = SCENARIOS[scenarioId as LinkDemoScenarioId];
  if (!fn) {
    throw new Error(
      `Unknown LINK_DEMO "${scenarioId}". Valid: ${LINK_DEMO_SCENARIO_IDS.join(', ')}`
    );
  }
  return fn(org);
}

/**
 * Applies fixture data for interactive `LINK_DEMO` runs (replaces API + search results).
 */
export function applyLinkDemoScenario(
  scenarioId: string,
  org: Org,
  p: {
    gitLinkedProjects: GitLinkedProject[];
    gitLinkedProjectsWithMisconfiguredRootDirectory: GitLinkedProjectWithMisconfiguredRootDirectory[];
    nonGitLinkedProjects: NonGitLinkedProject[];
  },
  detectedProjects: Map<string, Framework[]>
): void {
  const data = buildLinkDemoPayload(scenarioId, org);

  p.gitLinkedProjects.length = 0;
  p.gitLinkedProjectsWithMisconfiguredRootDirectory.length = 0;
  p.nonGitLinkedProjects.length = 0;
  p.gitLinkedProjects.push(...data.gitLinkedProjects);
  p.gitLinkedProjectsWithMisconfiguredRootDirectory.push(
    ...data.gitLinkedProjectsWithMisconfiguredRootDirectory
  );
  p.nonGitLinkedProjects.push(...data.nonGitLinkedProjects);

  detectedProjects.clear();
  for (const [dir, frameworks] of data.detectedProjects) {
    detectedProjects.set(dir, frameworks);
  }
}
