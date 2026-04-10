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
 * Stable ids for `LINK_DEMO=…` interactive fixtures (skips real API + search).
 *
 * ## `vc link --repo` (initial repo link)
 * Initial mode **does not list** existing Vercel projects that are not connected to this
 * Git repo, and **does not list** locally detected “new project” rows — users are pointed
 * to **`vercel link add`** for those. After that policy, the picker is mostly **git-linked**
 * and **misconfigured-root** rows.
 *
 * Use **`initial-*`** scenarios to preview that flow. Run **`initial-scope-*`** from a
 * matching subdirectory (`cd apps/web`, etc.) so cwd scoping matches the fixture.
 *
 * ## `vercel link add`
 * Full picker: non–git-linked matches, misconfigured roots, new local packages, and
 * projects already in `repo.json` filtered from the API list. Use **`add-*`** scenarios.
 *
 * ## Same fixture, both commands
 * Some **`add-*`** payloads include **only** suppressed row types (e.g. a single local
 * package, or only non-git). Under **`vc link --repo`** those fixtures yield **no primary
 * rows** (or only the “run `vercel link add`” hint) — useful to demo the difference.
 *
 * ## Previous scenario ids (renamed)
 * | Before | After |
 * |--------|--------|
 * | `mixed-all` | `add-mixed` |
 * | `dash-split` | `add-non-git-detect` |
 * | `root-linked` | `initial-root-one-git` |
 * | `one-detect` | `add-local-one` |
 * | `multi-detect` | `add-local-many` |
 * | `dual-misconfig` | `add-misconfig-dual` |
 * | `solo-non-git` | `add-non-git-solo` |
 * | `solo-misconfig` | `add-misconfig-solo` |
 * | `pair-git-nongit` | `add-pair-git-non-git` |
 * | `nest-web` | `initial-scope-apps-web` |
 * | `nest-api` | `initial-scope-apps-api` |
 */
export const LINK_DEMO_SCENARIO_IDS = [
  /** One git-linked row at repo root — typical single-row `vc link --repo` preview. */
  'initial-root-one-git',
  /** Git-linked `apps/web` only; run from `cd apps/web` to exercise cwd narrowing. */
  'initial-scope-apps-web',
  /** Git-linked `apps/api` only; run from `cd apps/api` to exercise cwd narrowing. */
  'initial-scope-apps-api',

  /** Git-linked + misconfigured + non-git + one detected “new” row — **`vercel link add`** full table. */
  'add-mixed',
  /** Non-git match (Vercel root vs suggested path) + local detect — **`vercel link add`**. */
  'add-non-git-detect',
  /** Only a local detected root (new package) — **`add`**: one checkbox row; **`--repo`**: suppressed. */
  'add-local-one',
  /** Several local detected roots — **`add`**: many rows; **`--repo`**: suppressed. */
  'add-local-many',
  /** Two misconfigured-root rows only — works for **`add`** and **`--repo`**. */
  'add-misconfig-dual',
  /** Single misconfigured row — works for **`add`** and **`--repo`**. */
  'add-misconfig-solo',
  /** Only a non–git-linked row — **`add`**: connect/link prompts; **`--repo`**: not listed. */
  'add-non-git-solo',
  /** One git-linked + one non-git, no local detections — **`vercel link add`**. */
  'add-pair-git-non-git',
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

function scenarioAddMixed(org: Org): LinkDemoPayload {
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

/** `add-non-git-detect`: non-git + local detect (no git-linked API rows). */
function scenarioAddNonGitDetect(org: Org): LinkDemoPayload {
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

function scenarioInitialRootOneGit(org: Org): LinkDemoPayload {
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

function scenarioAddLocalOne(_org: Org): LinkDemoPayload {
  return {
    gitLinkedProjects: [],
    gitLinkedProjectsWithMisconfiguredRootDirectory: [],
    nonGitLinkedProjects: [],
    detectedProjects: new Map([['apps/site', [fw('nextjs')]]]),
  };
}

function scenarioAddLocalMany(_org: Org): LinkDemoPayload {
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

function scenarioAddMisconfigDual(org: Org): LinkDemoPayload {
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

function scenarioAddNonGitSolo(org: Org): LinkDemoPayload {
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

function scenarioAddMisconfigSolo(org: Org): LinkDemoPayload {
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

function scenarioAddPairGitNonGit(org: Org): LinkDemoPayload {
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

/** Run from repo root with `cd apps/web` so cwd scope matches. */
function scenarioInitialScopeAppsWeb(org: Org): LinkDemoPayload {
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

/** Run from repo root with `cd apps/api` so cwd scope matches. */
function scenarioInitialScopeAppsApi(org: Org): LinkDemoPayload {
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
  'initial-root-one-git': scenarioInitialRootOneGit,
  'initial-scope-apps-web': scenarioInitialScopeAppsWeb,
  'initial-scope-apps-api': scenarioInitialScopeAppsApi,
  'add-mixed': scenarioAddMixed,
  'add-non-git-detect': scenarioAddNonGitDetect,
  'add-local-one': scenarioAddLocalOne,
  'add-local-many': scenarioAddLocalMany,
  'add-misconfig-dual': scenarioAddMisconfigDual,
  'add-misconfig-solo': scenarioAddMisconfigSolo,
  'add-non-git-solo': scenarioAddNonGitSolo,
  'add-pair-git-non-git': scenarioAddPairGitNonGit,
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
