import { frameworkList, type Framework } from '@vercel/frameworks';
import type { Org } from '@vercel-internals/types';

function fw(slug: string): Framework {
  const f = frameworkList.find(x => x.slug === slug);
  if (!f) {
    throw new Error(`LINK_DEMO: framework "${slug}" not in @vercel/frameworks`);
  }
  return f;
}

/**
 * Stable ids for `LINK_DEMO=…` interactive fixtures.
 *
 * **`nest-web`** / **`nest-api`** — Run from `apps/web` or `apps/api` (`cd …`) so the
 * repo-link picker scopes to that subdirectory (mirrors “single option at root”).
 */
export const LINK_DEMO_SCENARIO_IDS = [
  /** Git-linked + misconfigured + non-git + one detected “new” row. */
  'mixed-all',
  /** Dashboard at repo root vs suggested `apps/web` + local detect. */
  'dash-split',
  /** One git-linked project at repo root only. */
  'root-linked',
  /** Single locally detected app root (new project path). */
  'one-detect',
  /** Several detected roots, no API rows. */
  'multi-detect',
  /** Two misconfigured-root rows only. */
  'dual-misconfig',
  /** One non-git row (Vercel vs suggested mismatch). */
  'solo-non-git',
  /** One misconfigured row only. */
  'solo-misconfig',
  /** One git-linked + one non-git, no detections. */
  'pair-git-nongit',
  /** Under `apps/web` only — use after `cd apps/web`. */
  'nest-web',
  /** Under `apps/api` only — use after `cd apps/api`. */
  'nest-api',
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
    matchesFramework: true,
    matchesTeam: true,
    matchesRootDirectory: false,
    isLinkedToThisRepo: false,
  };
}

function scenarioMixedAll(org: Org): LinkDemoPayload {
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
 * No git-linked rows; one non-git match (Vercel root `""` vs suggested `apps/web`) + detect.
 */
function scenarioDashSplit(org: Org): LinkDemoPayload {
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

function scenarioRootLinked(org: Org): LinkDemoPayload {
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

function scenarioOneDetect(_org: Org): LinkDemoPayload {
  return {
    gitLinkedProjects: [],
    gitLinkedProjectsWithMisconfiguredRootDirectory: [],
    nonGitLinkedProjects: [],
    detectedProjects: new Map([['apps/site', [fw('nextjs')]]]),
  };
}

function scenarioMultiDetect(_org: Org): LinkDemoPayload {
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

function scenarioDualMisconfig(org: Org): LinkDemoPayload {
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

function scenarioSoloNonGit(org: Org): LinkDemoPayload {
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

function scenarioSoloMisconfig(org: Org): LinkDemoPayload {
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

function scenarioPairGitNongit(org: Org): LinkDemoPayload {
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

/** Fixture scoped to `apps/web` — run the CLI from that directory to test cwd narrowing. */
function scenarioNestWeb(org: Org): LinkDemoPayload {
  return {
    gitLinkedProjects: [
      demoGitLinked(org, {
        name: 'storefront',
        directory: 'apps/web',
        framework: 'nextjs',
      }),
    ],
    gitLinkedProjectsWithMisconfiguredRootDirectory: [],
    nonGitLinkedProjects: [],
    detectedProjects: new Map([['apps/web', [fw('nextjs')]]]),
  };
}

/** Fixture scoped to `apps/api` — run the CLI from that directory to test cwd narrowing. */
function scenarioNestApi(org: Org): LinkDemoPayload {
  return {
    gitLinkedProjects: [
      demoGitLinked(org, {
        name: 'api',
        directory: 'apps/api',
        framework: 'hono',
      }),
    ],
    gitLinkedProjectsWithMisconfiguredRootDirectory: [],
    nonGitLinkedProjects: [],
    detectedProjects: new Map([['apps/api', [fw('hono')]]]),
  };
}

const SCENARIOS: Record<LinkDemoScenarioId, (org: Org) => LinkDemoPayload> = {
  'mixed-all': scenarioMixedAll,
  'dash-split': scenarioDashSplit,
  'root-linked': scenarioRootLinked,
  'one-detect': scenarioOneDetect,
  'multi-detect': scenarioMultiDetect,
  'dual-misconfig': scenarioDualMisconfig,
  'solo-non-git': scenarioSoloNonGit,
  'solo-misconfig': scenarioSoloMisconfig,
  'pair-git-nongit': scenarioPairGitNongit,
  'nest-web': scenarioNestWeb,
  'nest-api': scenarioNestApi,
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
