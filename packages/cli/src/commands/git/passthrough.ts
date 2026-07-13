import { spawn } from 'child_process';
import chalk from 'chalk';
import ms from 'ms';
import { relative } from 'path';
import type Client from '../../util/client';
import { getRepoLink, findProjectsFromPath } from '../../util/link/repo';
import type { RepoProjectConfig } from '../../util/link/repo';
import { normalizePath } from '@vercel/build-utils';
import type { Deployment } from '@vercel-internals/types';
import getOrgById from '../../util/projects/get-org-by-id';
import output from '../../output-manager';
import { printDeploymentStatus } from '../../util/deploy/print-deployment-status';
import { displayBuildLogs } from '../../util/logs';
import stamp from '../../util/output/stamp';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import link from '../../util/output/link';
import sleepLib from '../../util/sleep';

/**
 * Trigger wait budgets.
 *
 * Long blocking after `git push` feels wrong, especially in non-TTY / CI.
 * Platform typically creates git-triggered Deployments in 5-15s but can take
 * 30-60s for borderline-large monorepos (30+ links) where webhook fanout is slow.
 *
 * Rules:
 *  - single project  → give server a little more time since log tail is the main value
 *  - multi project   → shorter, because the user just wants a summary; grace window
 *                      covers staggered triggers without holding the terminal for 2m.
 *  - non-TTY / CI / nonInteractive → never block for logs; shortest poll so `vc git push`
 *                      still returns fast and preserves `git push` semantics.
 */
const GIT_TRIGGER_TIMEOUT_SINGLE_TTY_MS = 60_000;
const GIT_TRIGGER_TIMEOUT_MULTI_TTY_MS = 35_000;
const GIT_TRIGGER_TIMEOUT_NON_TTY_MS = 12_000;

const GIT_POLL_INTERVAL_MS = 2_500;
const GIT_POLL_BACKOFF_AFTER_MS = 14_000;
const GIT_POLL_BACKOFF_INTERVAL_MS = 5_000;
const READY_POLL_INTERVAL_MS = 3_000;

// Grace window after first find: covers "1 deploy started right away, 1 took a bit longer".
// Capped at small values so multi-project TTY doesn't feel like 2 extra minutes.
const GRACE_EXTRA_SINGLE_MS = 12_000;
const GRACE_EXTRA_MULTI_MS = 18_000;
const GRACE_EXTRA_NON_TTY_MS = 5_000;

// Concurrency caps stay low — with many fewer waves now (12-35s rather than 120s),
// a small concurrency prevents 429s when 30 projects each request /v6/deployments + /v9/projects.
const GIT_PROJECT_FETCH_CONCURRENCY = 6;
const GIT_ORG_FETCH_CONCURRENCY = 4;

type DeployDecisionReason =
  | 'gitDisabled' // git.deploymentEnabled = false (or per-branch false)
  | 'ignoredByGitConfig' // explicit per-branch mapping disables
  | 'ignoreCommand' // vercel.json / ProjectSettings.commandForIgnoringBuildStep exited 0
  | 'ignoreCommandMissing' // undecidable locally — server decided to skip via ignoreCommand
  | 'rootDirectoryNoChange' // monorepo heuristic: no change in rootDirectory (best effort)
  | 'sourceless' // project.link.sourceless
  | 'noGitLink' // project has no link at all (manual only)
  | 'unknown';

interface DeployDecision {
  shouldDeploy: boolean;
  reason: DeployDecisionReason;
  detail?: string; // human hint: e.g. "git.deploymentEnabled[main]=false"
}

interface ProjectWithMeta extends RepoProjectConfig {
  orgIdResolved: string;
  orgSlug?: string;
  // enriched after we fetch /v9/projects/{id} once — optional so we don't have to fetch for every flow
  _project?: import('@vercel-internals/types').Project;
  _decision?: DeployDecision | undefined;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array(Math.min(concurrency, items.length))
    .fill(0)
    .map(async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) break;
        results[i] = await fn(items[i], i);
      }
    });
  await Promise.all(workers);
  return results;
}

interface PushInfo {
  targetBranch?: string;
  targetSha?: string;
  remoteName?: string;
}

function isPushArgs(args: string[]): boolean {
  if (args.length === 0) return false;
  // first non-flag arg should be "push" or implicit if first arg starts with flag? We support `vc git push ...`
  // args arriving here are already sliced past `git` subcommand routing — i.e. original cli argv past `... git`
  // Examples: ["push"], ["push","origin","main"], ["push","--force"]
  // Ignore if it starts with known subcommands that we handle explicitly.
  const knownSub = new Set(['connect', 'disconnect']);
  if (knownSub.has(args[0])) return false;
  return args[0] === 'push';
}

function parsePushInfo(args: string[]): PushInfo {
  // very lightweight: try to extract remote and branch from `git push [remote] [branch]`
  // ignores most flags
  const info: PushInfo = {};
  const positional: string[] = [];
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('-')) {
      // --set-upstream, -u takes next arg
      if (a === '-u' || a === '--set-upstream') {
        i++; // skip remote
        if (i < args.length) positional.push(args[i]);
        i++;
        if (i < args.length) positional.push(args[i]);
        i--;
        continue;
      }
      if (a.includes('=')) continue;
      // flags with no value or single dash combined
      continue;
    }
    positional.push(a);
  }
  if (positional[0]) info.remoteName = positional[0];
  if (positional[1]) {
    // could be refspec like HEAD:main or main or refs/heads/main:refs/heads/main
    const branch = positional[1].split(':').pop() || positional[1];
    info.targetBranch = branch.replace(/^refs\/heads\//, '');
  }
  return info;
}

async function spawnGit(
  client: Client,
  gitArgs: string[]
): Promise<{ exitCode: number; usedShas: Set<string> }> {
  // We attempt to pre-capture SHAs before and after to diff, but primary flow uses rev-parse
  const beforeShas = await tryGetRefShas(client.cwd).catch(() => new Map());
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    const child = spawn('git', gitArgs, {
      cwd: client.cwd,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', err => {
      reject(err);
    });
    child.on('close', code => {
      resolveExit(code ?? 0);
    });
  });
  const afterShas = await tryGetRefShas(client.cwd).catch(() => new Map());
  const usedShas = new Set<string>();
  for (const [ref, sha] of afterShas) {
    const before = beforeShas.get(ref);
    if (before !== sha) {
      usedShas.add(sha);
    }
  }
  // If we couldn't diff, fall back to HEAD
  if (usedShas.size === 0) {
    const head = await tryGetHeadSha(client.cwd).catch(() => undefined);
    if (head) usedShas.add(head);
  }
  return { exitCode, usedShas };
}

async function tryGetRefShas(cwd: string): Promise<Map<string, string>> {
  const { execSync } = await import('child_process');
  try {
    const out = execSync(
      'git for-each-ref --format="%(refname) %(objectname)" refs/heads',
      {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
    const map = new Map<string, string>();
    for (const line of out.trim().split('\n')) {
      if (!line.trim()) continue;
      const [ref, sha] = line.trim().split(' ');
      if (ref && sha) map.set(ref, sha);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function tryGetHeadSha(cwd: string): Promise<string | undefined> {
  const { execSync } = await import('child_process');
  try {
    const sha = execSync('git rev-parse HEAD', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return sha || undefined;
  } catch {
    return undefined;
  }
}

async function tryGetCurrentBranch(cwd: string): Promise<string | undefined> {
  const { execSync } = await import('child_process');
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!branch || branch === 'HEAD') return undefined;
    return branch;
  } catch {
    return undefined;
  }
}

async function resolveAllLinkedProjects(client: Client): Promise<{
  repoRoot: string;
  projects: ProjectWithMeta[];
  cwdRelativePath: string;
} | null> {
  const repoLink = await getRepoLink(client, client.cwd);
  if (repoLink?.repoConfig?.projects?.length) {
    const cwdRelative = normalizePath(
      relative(repoLink.rootPath, client.cwd) || '.'
    );

    const allProjects: ProjectWithMeta[] = [];
    for (const p of repoLink.repoConfig.projects) {
      const orgId = p.orgId ?? repoLink.repoConfig.orgId;
      if (!orgId) continue;
      allProjects.push({
        ...p,
        orgIdResolved: orgId,
      });
    }

    // resolve org slugs with limited concurrency (best-effort) so 30 projects doesn't slam /v2/teams.
    await mapWithConcurrency(
      allProjects,
      async proj => {
        try {
          const org = await getOrgById(client, proj.orgIdResolved);
          if (org) proj.orgSlug = org.slug;
        } catch {
          // ignore
        }
      },
      GIT_ORG_FETCH_CONCURRENCY
    );

    // De-dupe by project id in case repo.json has duplicates; keep first occurrence.
    const seen = new Set<string>();
    const deduped = allProjects.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    return {
      repoRoot: repoLink.rootPath,
      projects: deduped,
      cwdRelativePath: cwdRelative,
    };
  }

  // Fallback: single project linked via .vercel/project.json (no repo.json yet)
  // This still "works from anywhere in this repo" because we traverse up for .vercel
  try {
    const { getLinkedProject } = await import('../../util/projects/link');
    const { findRepoRoot } = await import('../../util/link/repo');
    const linked = await getLinkedProject(client, client.cwd);
    if (linked.status === 'linked') {
      const { org, project } = linked;
      const repoRoot = (await findRepoRoot(client.cwd)) || client.cwd;
      const cwdRelative = normalizePath(relative(repoRoot, client.cwd) || '.');
      const dir = normalizePath(project.rootDirectory || '.');
      const meta: ProjectWithMeta = {
        id: project.id,
        name: project.name,
        directory: dir,
        orgId: org.id,
        orgIdResolved: org.id,
        orgSlug: org.slug,
      };
      return {
        repoRoot,
        projects: [meta],
        cwdRelativePath: cwdRelative,
      };
    }
  } catch (e) {
    output.debug(`fallback linked project resolve failed: ${e}`);
  }

  return null;
}

/**
 * Heuristic evaluation of whether a project _elected_ not to deploy for this push.
 *
 * Today the platform has no "negative deployment" record — when a push is ignored
 * because of `git.deploymentEnabled=false`, per-branch mapping, `ignoreCommand`
 * exiting 0, `rootDirectory` with no changes, or a `sourceless` project, the API
 * simply creates no Deployment. So we can only infer locally. The logic:
 *  - fetch `/v9/projects/{id}` to get `link`, `rootDirectory`, `commandForIgnoringBuildStep`, git config
 *  - apply rules that are stable across Dashboard / vercel.json
 *  - when we can't evaluate (ignoreCommand needs server-side shell, root dir diff needs server file list),
 *    return `unknown` — caller should phrase as "no new deployment detected (may be ignored …)"
 *
 * This is intentionally best-effort: if the server ever surfaces a decision endpoint
 * (`…/should-deploy` / `…/git-decision`), `pollForProjectsDeployments` can promote
 * this to that endpoint without changing the UI contract.
 */
async function evaluateDeployDecision(
  client: Client,
  project: ProjectWithMeta,
  branchHint?: string
): Promise<DeployDecision | undefined> {
  if (project._decision) return project._decision;

  let full: any;
  try {
    full = project._project;
    if (!full) {
      const { default: getProjectByNameOrId } = await import(
        '../../util/projects/get-project-by-id-or-name'
      );
      full = await getProjectByNameOrId(
        client,
        project.id,
        project.orgIdResolved
      );
      if (full && typeof full === 'object' && 'id' in full) {
        project._project = full;
      } else {
        return undefined;
      }
    }
  } catch (e) {
    output.debug(
      `evaluateDeployDecision: fetch project ${project.id} failed: ${e}`
    );
    return undefined;
  }

  const link = full?.link as any;
  const git = (full?.git ?? full?.gitConfig ?? full?.link?.git) as any;
  const vercelJson = (full?.vercelJson ?? {}) as any;

  // No git wiring ⇒ project never auto-deploys on git push (manual/cli only)
  if (!link) {
    return {
      shouldDeploy: false,
      reason: 'noGitLink',
      detail: 'project is not connected to a Git repo (no link)',
    };
  }
  if (link.sourceless) {
    return {
      shouldDeploy: false,
      reason: 'sourceless',
      detail: 'project is sourceless / template-only',
    };
  }

  // git.deploymentEnabled may live in:
  // - project.link.deploymentEnabled (some API shapes)
  // - vercel.json `git.deploymentEnabled`
  // - Dashboard Project Settings → Git → Deployments
  // Normalize: boolean | Record<branch, boolean>
  const rawDeploymentEnabled =
    (git?.deploymentEnabled as boolean | Record<string, boolean> | undefined) ??
    (vercelJson?.git?.deploymentEnabled as
      | boolean
      | Record<string, boolean>
      | undefined);

  if (rawDeploymentEnabled === false) {
    return {
      shouldDeploy: false,
      reason: 'gitDisabled',
      detail: 'git.deploymentEnabled=false',
    };
  }
  if (
    rawDeploymentEnabled &&
    typeof rawDeploymentEnabled === 'object' &&
    branchHint
  ) {
    const v = (rawDeploymentEnabled as Record<string, boolean>)[branchHint];
    if (v === false) {
      return {
        shouldDeploy: false,
        reason: 'ignoredByGitConfig',
        detail: `git.deploymentEnabled[${branchHint}]=false`,
      };
    }
  }

  // ignoreCommand — if defined, server will skip deploy when it exits 0 or with matched code.
  // We can't evaluate the command locally without reproducing the full FS, so mark as
  // "maybe ignored by ignoreCommand" via `ignoreCommandMissing`, preserving the existing generic text
  // but letting caller label it: "skipped locally? unknown; dashboard may say ignored by Ignore Build Step".
  const ignoreCommand =
    full?.commandForIgnoringBuildStep ??
    vercelJson?.ignoreCommand ??
    git?.ignoreCommand ??
    null;
  if (ignoreCommand) {
    // We deliberately do not return a hard false here — if a deployment _did_ occur we don't
    // want to claim it was skipped. For the pending remainder set (no deployment found after timeout),
    // caller will surface this as the most likely explanation.
    // Store as soft hint; poller still keeps polling until deadline unless we switch to per-project
    // "shouldDeploy=false" hard-skip (which we only do for gitDisabled / sourceless).
    // So mark via detail but keep shouldDeploy true-ish → converted to soft reason in caller's render.
    return {
      shouldDeploy: true, // allow polling to continue; render layer will show soft reason
      reason: 'ignoreCommandMissing',
      detail: `project has ignoreCommand (${typeof ignoreCommand === 'string' ? ignoreCommand.slice(0, 60) : 'configured'}) — may have elected not to deploy`,
    };
  }

  // rootDirectory: if monorepo and this push touched only other dirs, server may skip.
  // We can't compute file diff server-side without asking for changed files list.
  // Report as unknown — caller will phrase as "no changes in rootDirectory?"
  if (
    full?.rootDirectory &&
    full.rootDirectory !== '.' &&
    full.rootDirectory !== ''
  ) {
    return {
      shouldDeploy: true,
      reason: 'rootDirectoryNoChange',
      detail: `rootDirectory=${full.rootDirectory} — server may have skipped due to no file changes`,
    };
  }

  return { shouldDeploy: true, reason: 'unknown' };
}

function isMatchingDeploymentForSha(
  dep: Deployment,
  shas: Set<string>,
  branchHint?: string
): boolean {
  // Git deployments from Vercel have source='git', gitSource.sha, gitSource.ref
  // Some deployments may not populate gitSource immediately, so we also check meta/githubCommitSha.
  const gitSha =
    dep.gitSource?.sha ||
    (dep.meta as any)?.githubCommitSha ||
    (dep.meta as any)?.gitlabCommitSha ||
    (dep.meta as any)?.bitbucketCommitSha;
  const gitRef = dep.gitSource?.ref || dep.gitSource?.slug;

  if (gitSha && shas.has(gitSha)) return true;

  // If we have branch hint but no sha yet, accept any git source deployment on that branch recently created
  if (branchHint && gitRef && dep.source === 'git') {
    if (gitRef === branchHint) return true;
    // some refs are full like refs/heads/main
    if (gitRef.endsWith(`/${branchHint}`)) return true;
  }

  // Fallback: accept any deployment with source === 'git' created very recently (within polling window)
  // We filter by recency outside
  return false;
}

async function findLatestGitDeploymentForProject(
  client: Client,
  project: ProjectWithMeta,
  shas: Set<string>,
  branchHint: string | undefined,
  since: number
): Promise<Deployment | null> {
  // Fetch recent deployments for project; rely on /v6/deployments?projectId=
  const query = new URLSearchParams({
    projectId: project.id,
    limit: '20',
  });
  // We keep team context via currentTeam set by caller, but also pass accountId to client if needed
  // fetchPaginated will include teamId automatically via client
  try {
    for await (const chunk of client.fetchPaginated<{
      deployments: Deployment[];
    }>(`/v6/deployments?${query}`, {
      accountId: project.orgIdResolved,
    })) {
      for (const dep of chunk.deployments) {
        if (!dep.createdAt || dep.createdAt < since - 10_000) {
          // deployments sorted newest first; if we pass the window we can stop scanning chunk likely
          // but continue a bit for safety
        }
        if (dep.createdAt && dep.createdAt < since - 600_000) {
          // older than 10 min before push -> ignore
          continue;
        }
        // Only consider git-triggered deployments, unless user manually triggered but with same sha
        if (
          dep.source &&
          dep.source !== 'git' &&
          dep.source !== 'import/repo' &&
          dep.source !== 'clone/repo'
        ) {
          // allow if sha matches anyway (e.g., cli deployment from same sha? we still want to show)
          // but prefer git
        }

        if (isMatchingDeploymentForSha(dep, shas, branchHint)) {
          return dep;
        }

        // Heuristic: if deployment is extremely recent (<2m) and git source and branch matches hint, take it even without sha match
        if (
          branchHint &&
          dep.source === 'git' &&
          dep.createdAt >= since - 5_000 &&
          dep.gitSource?.ref
        ) {
          const ref = dep.gitSource.ref;
          if (ref === branchHint || ref.endsWith(`/${branchHint}`)) {
            // If we haven't seen sha yet due to race, allow
            if (shas.size === 0 || !dep.gitSource?.sha) return dep;
          }
        }
      }
      // only first page needed typically; but allow 2 pages
      break;
    }
  } catch (err) {
    output.debug(`failed to fetch deployments for ${project.name}: ${err}`);
  }
  return null;
}

async function pollForProjectsDeployments(opts: {
  client: Client;
  projects: ProjectWithMeta[];
  shas: Set<string>;
  branchHint?: string;
  cwdRelativePath: string;
  isSingleProject?: boolean;
  ttyMode?: 'tty' | 'non-tty';
}) {
  const {
    client,
    projects,
    shas,
    branchHint,
    cwdRelativePath,
    isSingleProject,
    ttyMode,
  } = opts;
  const since = Date.now();
  const effectiveTty = ttyMode ?? 'tty';
  const timeoutMs =
    effectiveTty === 'non-tty'
      ? GIT_TRIGGER_TIMEOUT_NON_TTY_MS
      : isSingleProject
        ? GIT_TRIGGER_TIMEOUT_SINGLE_TTY_MS
        : GIT_TRIGGER_TIMEOUT_MULTI_TTY_MS;
  const deadline = since + timeoutMs;
  const graceExtraMs =
    effectiveTty === 'non-tty'
      ? GRACE_EXTRA_NON_TTY_MS
      : isSingleProject
        ? GRACE_EXTRA_SINGLE_MS
        : GRACE_EXTRA_MULTI_MS;

  // We want to distinguish "will never deploy" from "still queuing".
  // The platform has no negative-deployment record, so we do a best-effort local evaluation:
  // fetch /v9/projects/{id} in the background (concurrency-capped) and compute DeployDecision.
  // Projects whose decision is a hard "shouldDeploy=false" (gitDisabled, sourceless, noGitLink, per-branch false)
  // are moved out of `pending` early with a precise reason, instead of waiting 2 minutes.
  const decisionsEvaluated = new Map<string, DeployDecision>();
  let decisionsInFlight: Promise<void> | undefined;

  const evaluateDecisionsInBackground = () => {
    if (decisionsInFlight) return decisionsInFlight;
    decisionsInFlight = (async () => {
      await mapWithConcurrency(
        projects,
        async proj => {
          const prevTeam = client.config.currentTeam;
          try {
            const teamId = proj.orgIdResolved.startsWith('team_')
              ? proj.orgIdResolved
              : undefined;
            if (teamId) client.config.currentTeam = teamId;
            else client.config.currentTeam = undefined;
            const d = await evaluateDeployDecision(client, proj, branchHint);
            if (d) decisionsEvaluated.set(proj.id, d);
          } catch {
          } finally {
            client.config.currentTeam = prevTeam;
          }
        },
        GIT_PROJECT_FETCH_CONCURRENCY
      );
    })();
    return decisionsInFlight;
  };
  // kick off without awaiting — poll loop starts right away and uses whatever we already know
  void evaluateDecisionsInBackground();

  const pending = new Map<string, ProjectWithMeta>(
    projects.map(p => [p.id, p])
  );
  const found = new Map<string, Deployment>();
  const skippedHard = new Map<string, DeployDecision>(); // decided won't deploy (precise)
  const skippedSoft = new Map<string, DeployDecision>(); // may have skipped via ignoreCommand / rootDir heuristics

  // See comment block at top of file: grace window after first find accounts for
  // "one deploy started right away, another took a bit longer" without holding the
  // terminal for the full trigger timeout. Duration varies by TTY / single distinction.
  let firstFoundAt = 0;

  output.log(
    `Triggered git push. Polling ${projects.length} linked project${projects.length === 1 ? '' : 's'} for new deployments...`
  );

  const cwdMatchedIds = new Set(
    (
      findProjectsFromPath(
        projects as unknown as RepoProjectConfig[],
        cwdRelativePath
      ) as unknown as ProjectWithMeta[]
    ).map(p => p.id)
  );

  const noticeTruncated = (n: number) => {
    if (n <= 10) return;
    output.print(
      `  ${chalk.dim(`Tracking ${n} projects; showing links as they appear. Full list in Vercel dashboard.`)}\n`
    );
  };
  noticeTruncated(projects.length);

  let linesPrinted = 0;
  const MAX_INLINE_PROJECTS = 12;
  let deferredOverflow = 0;

  const formatDecisionLine = (proj: ProjectWithMeta, d: DeployDecision) => {
    switch (d.reason) {
      case 'gitDisabled':
        return `${chalk.dim('–')} ${chalk.bold(proj.name)} ${chalk.dim(`(${proj.directory})`)} ${chalk.dim('skipped — git.deploymentEnabled=false')}`;
      case 'ignoredByGitConfig':
        return `${chalk.dim('–')} ${chalk.bold(proj.name)} ${chalk.dim(`(${proj.directory})`)} ${chalk.dim(`skipped — ${d.detail || 'disabled for this branch'}`)}`;
      case 'noGitLink':
        return `${chalk.dim('–')} ${chalk.bold(proj.name)} ${chalk.dim(`(${proj.directory})`)} ${chalk.dim('not connected to git (manual deploys only)')}`;
      case 'sourceless':
        return `${chalk.dim('–')} ${chalk.bold(proj.name)} ${chalk.dim(`(${proj.directory})`)} ${chalk.dim('sourceless project — no git deploys')}`;
      case 'ignoreCommandMissing':
        // soft: only shown after polling exhausted
        return `${chalk.dim('–')} ${chalk.bold(proj.name)} ${chalk.dim(`(${proj.directory})`)} ${chalk.dim('no new deployment (likely ignoreCommand — check dashboard Build settings)')}`;
      case 'rootDirectoryNoChange':
        return `${chalk.dim('–')} ${chalk.bold(proj.name)} ${chalk.dim(`(${proj.directory})`)} ${chalk.dim('no new deployment (no changes in rootDirectory?)')}`;
      default:
        return `${chalk.dim('–')} ${chalk.bold(proj.name)} ${chalk.dim(`(${proj.directory})`)} ${chalk.dim(d.detail || 'no new deployment detected')}`;
    }
  };

  const flushFound = (
    items: Array<{ proj: ProjectWithMeta; dep: Deployment }>
  ) => {
    for (const { proj, dep } of items) {
      found.set(proj.id, dep);
      pending.delete(proj.id);
      if (firstFoundAt === 0) firstFoundAt = Date.now();
      const url = dep.url ? `https://${dep.url}` : dep.id;
      const targetLabel =
        dep.target === 'production' ? 'Production' : dep.target || 'Preview';
      const orgSlug = proj.orgSlug ? `${proj.orgSlug}/` : '';

      const isProd = dep.target === 'production';
      if (linesPrinted < MAX_INLINE_PROJECTS) {
        if (isProd) {
          printAlignedLabel(
            'Production',
            chalk.cyan(`https://${url.replace(/^https?:\/\//, '')}`),
            { gutter: '▲' }
          );
        } else {
          printAlignedLabel('Preview', chalk.cyan(url));
        }
        output.print(
          `  ${chalk.dim(`${orgSlug}${proj.name} (${proj.directory}) ${targetLabel} [${dep.readyState}]`)}\n`
        );
        if (dep.inspectorUrl) {
          printAlignedLabel('Inspect', chalk.cyan(dep.inspectorUrl));
        }
        linesPrinted++;
      } else {
        deferredOverflow++;
      }
      output.debug(`deployment link: ${url}`);
    }
    if (deferredOverflow > 0 && pending.size === 0) {
      output.print(
        `  ${chalk.dim(`… +${deferredOverflow} more deployments (run ${chalk.cyan('vc ls')} or open dashboard to see all)`)}\n`
      );
      deferredOverflow = -1;
    }
  };

  const flushSkippedHard = (
    items: Array<{ proj: ProjectWithMeta; decision: DeployDecision }>
  ) => {
    for (const { proj, decision } of items) {
      if (pending.has(proj.id)) {
        pending.delete(proj.id);
        skippedHard.set(proj.id, decision);
        if (linesPrinted < MAX_INLINE_PROJECTS) {
          output.print(`  ${formatDecisionLine(proj, decision)}\n`);
          linesPrinted++;
        } else {
          deferredOverflow++;
        }
      }
    }
  };

  let iteration = 0;
  while (Date.now() < deadline && pending.size > 0) {
    iteration++;
    // Grace window: once at least one deployment landed, allow a short extra window for
    // stragglers — shorter in single-project TTY (logs matter more than other projects)
    // and non-TTY (return fast). Uses the precomputed graceExtraMs which already varies by mode.
    if (found.size > 0 && firstFoundAt > 0) {
      const graceDeadline = Math.min(deadline, firstFoundAt + graceExtraMs);
      if (
        Date.now() >= graceDeadline &&
        pending.size > 0 &&
        projects.length > 1
      ) {
        // Collect soft reasons before bailing
        // Wait briefly for decision fetch to finish to give better messages
        if (decisionsInFlight) {
          try {
            await Promise.race([decisionsInFlight, sleepLib(1500)]);
          } catch {}
        }
        for (const proj of pending.values()) {
          const d = decisionsEvaluated.get(proj.id);
          if (d) {
            if (
              !d.shouldDeploy &&
              (d.reason === 'gitDisabled' ||
                d.reason === 'ignoredByGitConfig' ||
                d.reason === 'noGitLink' ||
                d.reason === 'sourceless')
            ) {
              skippedHard.set(proj.id, d);
            } else if (
              d.reason === 'ignoreCommandMissing' ||
              d.reason === 'rootDirectoryNoChange'
            ) {
              skippedSoft.set(proj.id, d);
            }
          }
        }
        break; // stop ticking, fall through to tail rendering
      }
    }

    const pendingArr = Array.from(pending.values());

    const checks: Array<{ proj: ProjectWithMeta; dep: Deployment | null }> =
      await mapWithConcurrency(
        pendingArr,
        async proj => {
          const teamId = proj.orgIdResolved.startsWith('team_')
            ? proj.orgIdResolved
            : undefined;
          const prevTeam = client.config.currentTeam;
          try {
            if (teamId) client.config.currentTeam = teamId;
            else client.config.currentTeam = undefined;
            const dep = await findLatestGitDeploymentForProject(
              client,
              proj,
              shas,
              branchHint,
              since
            );
            return { proj, dep };
          } finally {
            client.config.currentTeam = prevTeam;
          }
        },
        GIT_PROJECT_FETCH_CONCURRENCY
      );

    const newlyFound: Array<{ proj: ProjectWithMeta; dep: Deployment }> = [];
    for (const { proj, dep } of checks) {
      if (dep) newlyFound.push({ proj, dep });
    }
    if (newlyFound.length > 0) flushFound(newlyFound);

    // After first tick, allow hard-skipped projects to drop out early with a precise reason,
    // so 30-project monorepo doesn't wait 2m for 25 projects that elected not to deploy.
    if (iteration >= 1 && decisionsEvaluated.size > 0) {
      const toSkip: Array<{ proj: ProjectWithMeta; decision: DeployDecision }> =
        [];
      for (const proj of pending.values()) {
        const d = decisionsEvaluated.get(proj.id);
        if (!d) continue;
        if (
          !d.shouldDeploy &&
          (d.reason === 'gitDisabled' ||
            d.reason === 'ignoredByGitConfig' ||
            d.reason === 'noGitLink' ||
            d.reason === 'sourceless')
        ) {
          toSkip.push({ proj, decision: d });
        }
      }
      if (toSkip.length > 0) flushSkippedHard(toSkip);
    }

    if (pending.size === 0) break;

    const elapsed = Date.now() - since;
    const sleepMs =
      elapsed >= GIT_POLL_BACKOFF_AFTER_MS
        ? GIT_POLL_BACKOFF_INTERVAL_MS
        : GIT_POLL_INTERVAL_MS;
    await sleepLib(sleepMs);
  }

  // Make sure decision fetch finishes before we render the tail, so we can give precise reasons
  if (decisionsInFlight && (pending.size > 0 || skippedSoft.size === 0)) {
    try {
      await Promise.race([decisionsInFlight, sleepLib(1200)]);
    } catch {}
    // re-bin any remaining pending via newly available decisions
    for (const proj of pending.values()) {
      const d = decisionsEvaluated.get(proj.id);
      if (!d) continue;
      if (!d.shouldDeploy) skippedHard.set(proj.id, d);
      else if (
        d.reason === 'ignoreCommandMissing' ||
        d.reason === 'rootDirectoryNoChange'
      ) {
        skippedSoft.set(proj.id, d);
      }
    }
  }

  if (pending.size > 0 || skippedHard.size > 0 || skippedSoft.size > 0) {
    const allRemaining = [...pending.values()];
    const allReasonsMap = new Map<string, DeployDecision>();
    for (const [id, d] of skippedHard) allReasonsMap.set(id, d);
    for (const [id, d] of skippedSoft) allReasonsMap.set(id, d);
    // also attach any evaluated decision for plain pending so we can label it
    for (const proj of allRemaining) {
      const d = decisionsEvaluated.get(proj.id) ?? allReasonsMap.get(proj.id);
      if (d) allReasonsMap.set(proj.id, d);
    }

    if (allRemaining.length + skippedHard.size > 8) {
      // Large remaining set — collapse + show a few sampled reasons
      const total = allRemaining.length + skippedHard.size;
      const reasonCounts = new Map<DeployDecisionReason, number>();
      for (const d of allReasonsMap.values()) {
        reasonCounts.set(d.reason, (reasonCounts.get(d.reason) ?? 0) + 1);
      }
      const sortedReasons = Array.from(reasonCounts.entries())
        .filter(([r]) => r !== 'unknown')
        .sort((a, b) => b[1] - a[1]);

      // Compact tail
      const sample = [
        ...allRemaining,
        ...Array.from(skippedHard.keys())
          .map(id => projects.find(p => p.id === id)!)
          .filter(Boolean),
      ].slice(0, 8);

      if (skippedHard.size === 0) {
        output.print(
          `  ${chalk.dim('–')} ${chalk.dim(`${total} projects`)} ${chalk.dim('had no new deployment detected')}${sortedReasons.length ? chalk.dim(` (${sortedReasons.map(([r, n]) => `${r}:${n}`).join(', ')})`) : ''}. ${chalk.dim('Likely: ignored by git config / ignoreCommand / rootDirectory no changes, or still queuing.')}\n`
        );
      } else {
        output.print(
          `  ${chalk.dim('–')} ${chalk.dim(`${total} projects`)} ${chalk.dim('did not produce a new deployment')}${sortedReasons.length ? chalk.dim(` — ${sortedReasons.map(([r, n]) => `${r}×${n}`).join(', ')}`) : ''}\n`
        );
      }
      output.print(
        `  ${chalk.dim(
          `Sample: ${sample.map(p => p.name).join(', ')}${total > 8 ? ', …' : ''}`
        )}\n`
      );
      if (sortedReasons.length > 0) {
        // One more line hinting most common
        const [topReason] = sortedReasons[0];
        if (topReason === 'gitDisabled') {
          output.print(
            `  ${chalk.dim(`Tip: many projects have ${chalk.bold('git.deploymentEnabled=false')} — enable in vercel.json or Dashboard Git settings.`)}\n`
          );
        } else if (topReason === 'ignoreCommandMissing') {
          output.print(
            `  ${chalk.dim(`Tip: projects with an ${chalk.bold('Ignore Build Step')} may be intentionally skipping — check Dashboard → Build Settings.`)}\n`
          );
        } else if (topReason === 'ignoredByGitConfig') {
          output.print(
            `  ${chalk.dim(`Tip: per-branch git config disabled deploys for ${chalk.bold(branchHint || 'this branch')} — check ${chalk.bold('vercel.json → git.deploymentEnabled')} mapping.`)}\n`
          );
        }
      }
      if (output.isDebugEnabled()) {
        for (const proj of allRemaining) {
          const d = decisionsEvaluated.get(proj.id);
          output.debug(
            `no deployment for ${proj.name} (${proj.directory}) decision=${d?.reason ?? 'unknown'} detail=${d?.detail ?? ''}`
          );
        }
      }
    } else {
      // Small tail — line per project with precise reason when available
      for (const proj of allRemaining) {
        const d = decisionsEvaluated.get(proj.id) ?? allReasonsMap.get(proj.id);
        if (d && d.reason !== 'unknown') {
          output.print(`  ${formatDecisionLine(proj, d)}\n`);
        } else if (d) {
          output.print(
            `  ${chalk.dim('–')} ${chalk.bold(proj.name)} ${chalk.dim(`(${proj.directory})`)} ${chalk.dim('no new deployment detected (may be ignored by git config / no changes)')}\n`
          );
        } else {
          output.print(
            `  ${chalk.dim('–')} ${chalk.bold(proj.name)} ${chalk.dim(`(${proj.directory})`)} ${chalk.dim('no new deployment detected (may be ignored by git config / no changes)')}\n`
          );
        }
      }
      for (const [id, d] of skippedHard) {
        const proj = projects.find(p => p.id === id);
        if (!proj) continue;
        output.print(`  ${formatDecisionLine(proj, d)}\n`);
      }
      for (const [id, d] of skippedSoft) {
        const proj = projects.find(p => p.id === id);
        if (!proj) continue;
        // soft only shown when we truly have no deploy — avoids noisy lines during grace window
        if (pending.has(id)) continue; // already printed via generic tail above
        output.print(`  ${formatDecisionLine(proj, d)}\n`);
      }
    }
  }

  return {
    found,
    cwdMatchedIds,
    skipped: skippedHard as Map<string, DeployDecision> & Map<string, any>,
  };
}

function formatAge(createdAt?: number): string {
  if (!createdAt) return '';
  const age = Date.now() - createdAt;
  if (age < 0) return 'now';
  if (age < 1000) return 'just now';
  return ms(age) + ' ago';
}

function deploymentStateIcon(state?: string): {
  icon: string;
  color: (s: string) => string;
} {
  switch (state) {
    case 'READY':
      return { icon: '●', color: chalk.green };
    case 'ERROR':
      return { icon: '●', color: chalk.red };
    case 'BUILDING':
    case 'INITIALIZING':
    case 'QUEUED':
      return { icon: '●', color: chalk.yellow };
    case 'CANCELED':
      return { icon: '○', color: chalk.gray };
    default:
      return { icon: '○', color: chalk.gray };
  }
}

function getBranchFromDeployment(dep: Deployment): string | undefined {
  // gitSource.ref is often like "refs/heads/<branch>" or just "<branch>"
  // gitSource.slug is usually branch name for PRs; sourceRef branch in some APIs
  const raw =
    dep.gitSource?.ref ||
    dep.gitSource?.slug ||
    (dep as any)?.sourceCommit?.ref ||
    dep.meta?.githubCommitRef ||
    dep.meta?.gitlabCommitRef;
  if (!raw) return undefined;
  return raw.replace(/^refs\/heads\//, '');
}

async function fetchLatestDeploymentsForBranch(
  client: Client,
  project: ProjectWithMeta,
  branch: string | undefined,
  limit = 5
): Promise<Deployment[]> {
  const query = new URLSearchParams({
    projectId: project.id,
    limit: String(limit),
  });
  try {
    for await (const chunk of client.fetchPaginated<{
      deployments: Deployment[];
    }>(`/v6/deployments?${query}`, {
      accountId: project.orgIdResolved,
    })) {
      if (!branch) {
        // No branch filter, return whatever we got (newest first)
        return chunk.deployments;
      }
      const filtered = chunk.deployments.filter(d => {
        const b = getBranchFromDeployment(d);
        if (!b) {
          // If no branch info but source=git and we have no other heuristic,
          // include it if it's very recent? For status summary we prefer branch match.
          // Still include if source !== 'git' is false? Simpler: exclude when branch requested.
          return false;
        }
        return b === branch;
      });
      if (filtered.length > 0) {
        return filtered;
      }
      // If first page had zero matches for this branch, try one more page before giving up
      // (keep loop by returning [] and letting caller decide, but we break after 2 pages anyway)
      // Fall back to unfiltered if nothing matched at all after scanning?
      // For UX we show nothing rather than wrong branch.
      // Continue to next chunk only if we explicitly want deeper scan – we keep to 2 pages.
      // So break here to avoid unnecessary fetching when likely no deployment.
      const hasBranchInChunk = chunk.deployments.some(d =>
        Boolean(getBranchFromDeployment(d))
      );
      if (!hasBranchInChunk) {
        // chunk had no branch info at all – likely API shape change, return raw
        return chunk.deployments;
      }
      // else chunk had branch info but none matched → try one more page
      // by fetching again outside loop we already break after 1 iteration in current paginated impl,
      // so just return filtered (empty).
      return filtered;
    }
  } catch (err) {
    output.debug(
      `failed to fetch branch deployments for ${project.name}: ${err}`
    );
  }
  return [];
}

async function showBranchDeploymentSummary(opts: {
  client: Client;
  projects: ProjectWithMeta[];
  cwdRelativePath: string;
  branch: string | undefined;
  headSha?: string;
}) {
  const { client, projects, cwdRelativePath, branch, headSha } = opts;

  // findProjectsFromPath is typed for RepoProjectConfig, but ProjectWithMeta extends it
  // so casting via unknown is safe here – we only read extra fields for org routing.
  const cwdMatched = findProjectsFromPath(
    projects as unknown as RepoProjectConfig[],
    cwdRelativePath
  ) as unknown as ProjectWithMeta[];
  const projectsToShow: ProjectWithMeta[] =
    cwdMatched.length > 0 ? cwdMatched : projects;

  if (projectsToShow.length === 0) return;

  const titleBranch = branch ? chalk.bold(branch) : chalk.dim('current branch');
  // Blank line separator from git output, then section heading using cli-ux pattern: no gutter for section, bold title
  output.print(`\n${chalk.bold('Vercel Deployments')} for ${titleBranch}`);
  if (headSha) {
    output.print(` ${chalk.dim(headSha.slice(0, 7))}`);
  }
  output.print(`\n`);

  const sorted = [...projectsToShow].sort((a, b) => {
    const da = a.directory.split('/').length;
    const db = b.directory.split('/').length;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });

  // Also cap status fetch concurrency for big monorepos (git status path)
  const results = await mapWithConcurrency(
    sorted,
    async proj => {
      const prevTeam = client.config.currentTeam;
      try {
        client.config.currentTeam = proj.orgIdResolved.startsWith('team_')
          ? proj.orgIdResolved
          : undefined;
        const deps = await fetchLatestDeploymentsForBranch(
          client,
          proj,
          branch,
          5
        );
        return { proj, deps };
      } finally {
        client.config.currentTeam = prevTeam;
      }
    },
    GIT_PROJECT_FETCH_CONCURRENCY
  );

  const MAX_STATUS_INLINE = 10;
  let anyDeploys = false;
  let inlineShown = 0;
  let overflow = 0;
  for (const { proj, deps } of results) {
    const orgSlug = proj.orgSlug ? `${proj.orgSlug}/` : '';
    const header = `${chalk.bold(orgSlug + proj.name)} ${chalk.dim(`(${proj.directory})`)}`;
    if (deps.length === 0) {
      if (inlineShown < MAX_STATUS_INLINE) {
        output.print(
          `  ${chalk.dim('–')} ${header} ${chalk.dim(branch ? `no deployments for ${branch}` : 'no deployments')}\n`
        );
      }
      inlineShown++;
      continue;
    }
    anyDeploys = true;
    if (inlineShown < MAX_STATUS_INLINE) {
      output.print(`  ${header}\n`);
      for (const dep of deps) {
        const { icon, color } = deploymentStateIcon(dep.readyState);
        const target =
          dep.target === 'production' ? 'Production' : dep.target || 'Preview';
        const url = dep.url ? `https://${dep.url}` : dep.id;
        const shaShort =
          dep.gitSource?.sha?.slice(0, 7) ||
          dep.meta?.githubCommitSha?.slice(0, 7) ||
          '';
        const isHead = Boolean(
          headSha && shaShort && headSha.startsWith(shaShort)
        );
        const age = formatAge(dep.createdAt);
        output.print(
          `    ${color(icon)} ${chalk.dim(`[${dep.readyState || 'UNKNOWN'}]`)} ${chalk.cyan(url)} ${chalk.dim(target)}${shaShort ? ` ${chalk.dim(shaShort)}` : ''}${isHead ? chalk.green(' ← HEAD') : ''} ${chalk.dim(age)}\n`
        );
        if (dep.inspectorUrl) {
          output.print(
            `      ${chalk.dim('Inspect:')} ${link(dep.inspectorUrl)}\n`
          );
        }
      }
      inlineShown++;
    } else {
      overflow++;
    }
  }
  if (overflow > 0) {
    output.print(
      `  ${chalk.dim(`… +${overflow} more projects not shown (run ${chalk.cyan('vc ls')} for full list)`)}\n`
    );
  }

  if (!anyDeploys) {
    output.print(
      `\n  ${chalk.dim(`No deployments found. Push to trigger one, or run ${chalk.cyan('vc deploy')} for manual.`)}\n`
    );
  } else {
    output.print(
      `\n  ${chalk.dim(`Run ${chalk.cyan('vc ls')} or ${chalk.cyan('vc inspect <url>')} for more details.`)}\n`
    );
  }
}

async function fetchDeploymentByIdWithFallback(
  client: Client,
  id: string,
  accountId: string
): Promise<Deployment> {
  try {
    return await client.fetch<Deployment>(
      `/v13/deployments/${encodeURIComponent(id)}`,
      { accountId }
    );
  } catch (firstErr: any) {
    const status = (firstErr && (firstErr.status || firstErr.statusCode)) || 0;
    const msg = String(firstErr?.message || '');
    if (status === 404 || msg.includes('404')) {
      output.debug(`v13 fetch 404 for ${id}, falling back to v6: ${msg}`);
      return await client.fetch<Deployment>(
        `/v6/deployments/${encodeURIComponent(id)}`,
        { accountId }
      );
    }
    throw firstErr;
  }
}

async function streamDeploymentUntilReady(
  client: Client,
  deployment: Deployment,
  project: ProjectWithMeta,
  shouldStreamLogs: boolean
): Promise<Deployment> {
  let current = deployment;
  const deployStamp = stamp();
  const isTeam = project.orgIdResolved.startsWith('team_');
  client.config.currentTeam = isTeam ? project.orgIdResolved : undefined;

  let abortController: AbortController | undefined;
  let logPromise: Promise<void> | undefined;
  let logRetryTimer: ReturnType<typeof setTimeout> | undefined;
  let logAttempt = 0;
  let awaitingReady = true;

  const MAX_LOG_RETRIES_BEFORE_READY = 6; // covers ~ 24s of 404 warmup

  const startLogTail = (dep: Deployment) => {
    if (abortController) {
      // Clean previous controller before reattaching
      try {
        abortController.abort();
      } catch {}
      abortController = undefined;
    }
    logAttempt++;
    try {
      const { promise, abortController: ac } = displayBuildLogs(
        client,
        dep,
        true
      );
      abortController = ac;
      logPromise = promise;
      promise.catch(err => {
        const msg = String((err as any)?.message || err || '');
        const is404 =
          msg.includes('404') && msg.toLowerCase().includes('deployment');
        if (
          is404 &&
          awaitingReady &&
          logAttempt <= MAX_LOG_RETRIES_BEFORE_READY
        ) {
          output.debug(
            `log stream 404 for ${project.name} ${dep.id} attempt ${logAttempt}/${MAX_LOG_RETRIES_BEFORE_READY}, retrying in background`
          );
          // Schedule background retry — don't surface to user yet
          if (!logRetryTimer) {
            logRetryTimer = setTimeout(() => {
              logRetryTimer = undefined;
              if (!awaitingReady) return;
              startLogTail(current);
            }, 4000);
          }
          return;
        }
        if (is404) {
          output.debug(
            `log stream giving up after ${logAttempt} attempts for ${project.name} ${dep.id}: ${msg}`
          );
          // Don't warn — readyState polling still continues and we have inspect fallback
          return;
        }
        output.warn(`Failed to read build logs: ${msg}`);
        output.debug(`log stream error for ${project.name}: ${err}`);
      });
    } catch (e) {
      output.debug(`failed to start log stream: ${e}`);
      if (awaitingReady && logAttempt < MAX_LOG_RETRIES_BEFORE_READY) {
        if (!logRetryTimer) {
          logRetryTimer = setTimeout(() => {
            logRetryTimer = undefined;
            startLogTail(current);
          }, 3000);
        }
      }
    }
  };

  if (shouldStreamLogs) {
    // Git deploys: events endpoint may not be indexed immediately.
    // Start right away — printEvents will stream if available, 404-catch above will schedule retries.
    // Don't await delay: start immediately so we don't miss early build lines.
    startLogTail(current);
  }

  // Poll readyState
  let consecutive404 = 0;
  while (true) {
    try {
      const fresh = await fetchDeploymentByIdWithFallback(
        client,
        current.id,
        project.orgIdResolved
      );
      current = fresh;
      consecutive404 = 0;

      // If initial log tail 404'd, re-attach as soon as BUILDING
      if (
        shouldStreamLogs &&
        !abortController &&
        (current.readyState === 'BUILDING' ||
          current.readyState === 'INITIALIZING' ||
          current.readyState === 'QUEUED')
      ) {
        startLogTail(current);
      }

      const state = current.readyState;
      if (state === 'READY' || state === 'ERROR' || state === 'CANCELED') {
        break;
      }
      if (!shouldStreamLogs) {
        output.spinner(
          `Building ${chalk.bold(project.name)} ${chalk.dim(`[${state}]`)}`
        );
      }
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      const is404 = msg.includes('404');
      if (is404) {
        consecutive404++;
        // Also try to re-attach log tail during 404 warmup — events may still be absent but ready
        // poll will recover. Don't spam but keep one retry in flight.
        if (shouldStreamLogs && !abortController && !logRetryTimer) {
          logRetryTimer = setTimeout(() => {
            logRetryTimer = undefined;
            if (!awaitingReady) return;
            startLogTail(current);
          }, 4000);
        }
        if (consecutive404 >= 5) {
          output.debug(
            `giving up polling deployment ${current.id} after ${consecutive404} consecutive 404s`
          );
          output.warn(
            `Deployment ${chalk.bold(current.id)} not found (404). It may still be building — try ${chalk.cyan(
              'vc inspect ' + current.id + ' --logs'
            )} or ${link(
              current.inspectorUrl ||
                `https://vercel.com/${project.orgSlug || ''}/${project.name}/${current.id}`
            )}`
          );
          break;
        }
      } else {
        consecutive404 = 0;
      }
      output.debug(`failed to poll deployment ${current.id}: ${e}`);
    }
    await sleepLib(READY_POLL_INTERVAL_MS);
  }

  awaitingReady = false;
  if (logRetryTimer) {
    clearTimeout(logRetryTimer);
    logRetryTimer = undefined;
  }

  if (abortController) {
    try {
      abortController.abort();
    } catch {}
    output.stopSpinner();
    if (logPromise) {
      try {
        await Promise.race([logPromise.catch(() => {}), sleepLib(800)]);
      } catch {}
    }
  } else {
    output.stopSpinner();
    if (shouldStreamLogs) {
      // Only warn when we truly never attached — user-facing hint with inspect fallback
      output.print(
        `${chalk.dim('Build logs unavailable via events stream (may be warming up).')}\n`
      );
      output.print(
        `  ${chalk.dim('Inspect:')} ${link(
          current.inspectorUrl ||
            `https://vercel.com/${project.orgSlug || ''}/${project.name}/${current.id}`
        )}  ${chalk.dim(`or ${chalk.cyan('vc inspect ' + current.id + ' --logs')}`)}\n`
      );
    }
  }

  try {
    await printDeploymentStatus(
      client,
      {
        readyState: current.readyState,
        alias: (current as any).alias || [],
        aliasError: (current as any).aliasError,
        target: current.target || 'preview',
        indications: [],
        url: current.url,
        aliasWarning: (current as any).aliasWarning,
      },
      deployStamp,
      false,
      false,
      false
    );
  } catch {
    output.print(
      `\n${current.readyState === 'READY' ? chalk.green('✓') : chalk.red('✗')} ${chalk.bold(
        project.name
      )} ${chalk.dim(current.readyState)} ${chalk.cyan(
        `https://${current.url}`
      )}\n`
    );
  }

  if (current.inspectorUrl) {
    printAlignedLabel('Inspect', link(current.inspectorUrl));
  }

  return current;
}

export default async function gitPassthrough(
  client: Client,
  rawArgs: string[],
  wrapperOpts?: { noAttach?: boolean; logs?: boolean; noLogs?: boolean }
): Promise<number> {
  // rawArgs = argv sliced after `git`, e.g. ["push"] or ["status"] etc.
  // Wrapper flags (--no-attach, --logs, --no-logs) are parsed by the parent
  // command (git/index.ts) via getFlagsSpecification. For backwards compat,
  // also support manual extraction if caller passes them in rawArgs.
  const wrapperFlags = {
    noAttach: Boolean(wrapperOpts?.noAttach),
    logs: Boolean(wrapperOpts?.logs),
    noLogs: Boolean(wrapperOpts?.noLogs),
  };
  const gitArgs: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (!wrapperOpts) {
      if (arg === '--no-attach') {
        wrapperFlags.noAttach = true;
        continue;
      }
      if (arg === '--logs' || arg === '-l') {
        wrapperFlags.logs = true;
        continue;
      }
      if (arg === '--no-logs') {
        wrapperFlags.noLogs = true;
        continue;
      }
    }
    gitArgs.push(arg);
  }

  if (gitArgs.length === 0) {
    // show help if bare `vc git`
    output.print(
      `Usage: vc git <git-args>  (passthrough) or vc git connect|disconnect\n`
    );
    return 2;
  }

  const push = isPushArgs(gitArgs);
  const pushInfo = push ? parsePushInfo(gitArgs) : {};
  let branchHint = pushInfo.targetBranch;
  if (push && !branchHint) {
    branchHint = await tryGetCurrentBranch(client.cwd).catch(() => undefined);
  }

  // Run git
  let shas = new Set<string>();
  let gitExit: number;
  try {
    const res = await spawnGit(client, gitArgs);
    gitExit = res.exitCode;
    shas = res.usedShas;
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      output.error('Git is not installed or not found in PATH.');
      return 1;
    }
    output.error(`Failed to run git: ${err?.message || String(err)}`);
    return 1;
  }

  const isStatus = gitArgs[0] === 'status';

  // If not push, handle status summary before returning
  if (!push) {
    if (gitExit === 0 && isStatus) {
      // Don't block on summary errors — always preserve git exit code
      try {
        const branch = await tryGetCurrentBranch(client.cwd).catch(
          () => undefined
        );
        const headSha = await tryGetHeadSha(client.cwd).catch(() => undefined);
        const repoInfo = await resolveAllLinkedProjects(client);
        if (repoInfo) {
          await showBranchDeploymentSummary({
            client,
            projects: repoInfo.projects,
            cwdRelativePath: repoInfo.cwdRelativePath,
            branch,
            headSha,
          });
        }
      } catch (e) {
        output.debug(`status deployment summary failed: ${e}`);
      }
    } else if (gitExit === 0) {
      output.debug(
        `git ${gitArgs.join(' ')} completed (exit ${gitExit}), no deployment polling`
      );
    }
    return gitExit;
  }

  if (gitExit !== 0 || wrapperFlags.noAttach) {
    return gitExit;
  }

  // Push succeeded: now find linked projects
  const repoInfo = await resolveAllLinkedProjects(client);
  if (!repoInfo) {
    output.log(
      chalk.dim(
        `No linked Vercel projects found for this repository. Run ${chalk.cyan(
          'vc link'
        )} to link projects, or use ${chalk.cyan('vc deploy')} for manual deploys.`
      )
    );
    return gitExit;
  }

  const { projects, cwdRelativePath } = repoInfo;

  // Infer TTY / non-TTY semantics for timeout & log policy.
  // - client.nonInteractive may be true inside CI / `vc --yes`
  // - stdout/stderr !isTTY happens when `vc git push | tee` or when caller is a program
  // Behavior matrix:
  //   single + tty         → up to 60s trigger, 12s grace, auto-logs
  //   single + non-tty     → 12s trigger, 5s grace, NO log streaming (programmatic must use --logs to opt-in)
  //   multi + tty          → 35s trigger, 18s grace after first find (staggered monorepo), no auto log streaming
  //   multi + non-tty      → 12s trigger, 5s grace, summary-only
  const isStdoutTTY = Boolean(client.stdout?.isTTY ?? process.stdout.isTTY);
  const isStderrTTY =
    typeof process.stderr.isTTY === 'boolean' ? process.stderr.isTTY : true;
  const effectiveNonInteractive =
    Boolean((client as any).nonInteractive) || !isStdoutTTY;
  const ttyMode: 'tty' | 'non-tty' = effectiveNonInteractive
    ? 'non-tty'
    : 'tty';

  // Heuristically decide single vs multi *before* polling so we can pick the right budget
  // and avoid blocking 60s when this is really a 30-project monorepo.
  // If cwdRelativePath maps to exactly one project via findProjectsFromPath, treat as single UX
  // even if repo.json has many entries — user's intent is "I am in one project".
  let isSingleProjectHeuristic = repoInfo.projects.length === 1;
  let cwdMatchedIdsHint: Set<string> | undefined;
  if (!isSingleProjectHeuristic) {
    try {
      const matched = findProjectsFromPath(
        repoInfo.projects as unknown as RepoProjectConfig[],
        cwdRelativePath
      );
      if (matched.length === 1) {
        isSingleProjectHeuristic = true;
        cwdMatchedIdsHint = new Set(matched.map(p => p.id));
      }
    } catch {
      // never block push UX
    }
  }

  if (ttyMode === 'non-tty') {
    output.debug(
      `git push detected but stdout !isTTY (or nonInteractive); using short timeouts: ${!isStdoutTTY ? 'stdout!isTTY' : 'nonInteractive'} ${!isStderrTTY ? '+ stderr!isTTY' : ''}`
    );
  }

  // Poll — with grace window and skip-reason detection handled inside.
  const { found, cwdMatchedIds } = await pollForProjectsDeployments({
    client,
    projects,
    shas,
    branchHint,
    cwdRelativePath,
    isSingleProject: isSingleProjectHeuristic,
    ttyMode,
  });

  if (found.size === 0) {
    return gitExit;
  }

  if (wrapperFlags.noLogs) {
    return gitExit;
  }

  // ── TTY-aware log policy ───────────────────────────────────────────────
  // - non-TTY (piped, CI, --yes, programmatic): NEVER auto-stream logs — blocks don't compose well with pipes.
  //   `vc git push` in that mode preserves plain `git push` exit code and returns quickly; caller can
  //   explicitly opt in with --logs if they really want streamed logs in non-TTY (we still stream if --logs).
  // - tty: single repo → stream logs; multi → summary only (as requested), unless --logs forces cwd-matched.
  const shouldAutoLogBase = !wrapperFlags.noLogs;
  const shouldForceLog = wrapperFlags.logs;
  const shouldAutoLog =
    ttyMode === 'non-tty'
      ? shouldForceLog /* only when user forced */
      : shouldAutoLogBase;

  if (ttyMode === 'non-tty' && shouldAutoLogBase && !shouldForceLog) {
    // In non-TTY we suppress the implicit "Attaching to deployment ..." line entirely —
    // machine consumers don't want spinner/logs. Still show deployment URLs (already printed by poller).
    output.debug(
      'non-TTY detected: skipping auto log attach (use --logs to force)'
    );
  }

  // ── single vs multi UX (your request) ──────────────────────────────────
  // isSingleProjectHeuristic already computed before poll for timeout reasons;
  // recompute definitive version now that we know `found` (same logic, but prefer found evidence).
  const isSingleProjectRepo =
    isSingleProjectHeuristic ||
    // repo.json may list 30 but cwd matched only one deepest — still single UX for that cwd.
    // Use hint if poll returned a definitive cwdMatchedIds that differs from early estimate.
    (cwdMatchedIds.size === 1 &&
      projects.length > 1 &&
      Array.from(cwdMatchedIds).some(id => found.has(id)));

  const pickDeepest = (ids: Iterable<string>) => {
    const candidates = Array.from(ids)
      .map(id => projects.find(p => p.id === id)!)
      .filter(Boolean)
      .sort(
        (a, b) => b.directory.split('/').length - a.directory.split('/').length
      );
    for (const c of candidates) {
      if (found.has(c.id)) return c.id;
    }
    return undefined;
  };

  if (!isSingleProjectRepo) {
    // Multi-project path: summary table, no log streaming by default.
    // In non-TTY, this is the *only* path (single repo in non-TTY is also summarized below
    // before log logic). Here we own the full table — even for overflow-hidden items,
    // re-render a compact complete list so callers in CI get deterministic parsable output.
    const foundEntries = Array.from(found.entries());
    const sortedFound = foundEntries
      .map(([id, dep]) => ({ proj: projects.find(p => p.id === id)!, dep }))
      .filter(x => x.proj)
      .sort((a, b) => {
        const aProd = a.dep.target === 'production' ? 0 : 1;
        const bProd = b.dep.target === 'production' ? 0 : 1;
        if (aProd !== bProd) return aProd - bProd;
        const depth = (p: ProjectWithMeta) => p.directory.split('/').length;
        const dd = depth(a.proj) - depth(b.proj);
        if (dd !== 0) return dd;
        return a.proj.name.localeCompare(b.proj.name);
      });

    // In non-TTY / piped we still print, but avoid chalk.bold where possible for machine readers?
    // Keep visual but parsable: state icon + url is stable.
    if (ttyMode !== 'non-tty') {
      output.print(
        `\n${chalk.bold('Deployments for')} ${chalk.bold(branchHint || 'this push')}\n`
      );
    } else {
      output.print(
        `\nDeployments for ${branchHint || 'this push'} (${found.size}):\n`
      );
    }
    const maxName = Math.min(
      32,
      Math.max(...sortedFound.map(({ proj }) => proj.name.length), 10)
    );
    for (const { proj, dep } of sortedFound) {
      const { icon, color } = deploymentStateIcon(dep.readyState);
      const orgSlug = proj.orgSlug ? `${proj.orgSlug}/` : '';
      const url = dep.url ? `https://${dep.url}` : dep.id;
      const target =
        dep.target === 'production' ? 'Production' : dep.target || 'Preview';
      const namePadded =
        ttyMode === 'non-tty' ? proj.name : proj.name.padEnd(maxName);
      if (ttyMode === 'non-tty') {
        // Plain, machine-friendly: name <url> [state] target
        output.print(
          `${namePadded} ${url} [${dep.readyState || 'UNKNOWN'}] ${target}\n`
        );
        if (dep.inspectorUrl) {
          output.print(`  Inspect: ${dep.inspectorUrl}\n`);
        }
      } else {
        output.print(
          `  ${color(icon)} ${chalk.bold(namePadded)} ${chalk.dim(`(${proj.directory})`)}  ${chalk.cyan(url)} ${chalk.dim(`· ${target} · [${dep.readyState || 'UNKNOWN'}]`)}\n`
        );
        if (dep.inspectorUrl) {
          output.print(
            `    ${chalk.dim(`${orgSlug}${proj.name} Inspect:`)} ${link(dep.inspectorUrl)}\n`
          );
        }
      }
    }

    // Only hint about logs in TTY — non-TTY caller piped vc git push
    if (ttyMode === 'non-tty') {
      output.print(
        `\n${found.size} deployment(s) triggered. In non-interactive mode, logs are not streamed. Run with ${chalk.cyan('vc git push --logs')} or ${chalk.cyan('vc inspect <url> --logs')}.\n`
      );
    } else {
      output.print(
        `\n  ${chalk.dim(`All ${found.size} deployment(s) triggered. Logs not streamed for multi-project push.`)} ${chalk.dim(`Use:`)} ${chalk.cyan('vc inspect <url> --logs')} ${chalk.dim('or rerun from inside a project directory to stream that project. Or:')} ${chalk.cyan(`vc git push --logs`)} ${chalk.dim('(forces streaming for cwd-matched project).')}\n`
      );
    }

    if (shouldForceLog) {
      // Explicit opt-in from vc git push --logs even in multi-project repo:
      // stream logs for the cwd-matched deepest project only (if any). This respects
      // the "don't spam one project's logs across 30 lines" rule by picking one.
      const forcedId = pickDeepest(cwdMatchedIdsHint ?? cwdMatchedIds);
      if (forcedId) {
        const forcedProj = projects.find(p => p.id === forcedId);
        const forcedDep = found.get(forcedId);
        if (forcedProj && forcedDep) {
          output.print('\n');
          output.log(
            `--logs: streaming build logs for ${chalk.bold(forcedProj.name)} ${chalk.dim(`(${forcedProj.directory})`)} ${chalk.dim('(other projects continue server-side)')}`
          );
          try {
            await streamDeploymentUntilReady(
              client,
              forcedDep,
              forcedProj,
              true
            );
          } catch (err: any) {
            output.debug(`forced stream failed: ${err?.stack || err}`);
          }
        }
      }
    }

    return gitExit;
  }

  // ── Single-project path: normal output plus logs (TTY-only by default) ──────
  // Non-TTY: short-circuit to summary line — don't block on log tail, preserve git exit semantics.
  if (ttyMode === 'non-tty' && !shouldForceLog) {
    const onlyId = Array.from(found.keys())[0];
    const onlyDep = onlyId ? found.get(onlyId) : undefined;
    if (onlyDep) {
      const url = onlyDep.url ? `https://${onlyDep.url}` : onlyDep.id;
      output.print(
        `Deployment triggered: ${url} [${onlyDep.readyState}] ${onlyDep.inspectorUrl ? `Inspect: ${onlyDep.inspectorUrl}` : ''}\n`
      );
    }
    // Don't attach logs in non-TTY unless --logs — return quickly.
    return gitExit;
  }

  let primaryProjectId: string | undefined;
  if (cwdMatchedIds.size > 0) {
    primaryProjectId = pickDeepest(cwdMatchedIds);
  } else if (cwdMatchedIdsHint && cwdMatchedIdsHint.size > 0) {
    primaryProjectId = pickDeepest(cwdMatchedIdsHint);
  }

  if (!primaryProjectId) {
    const isRootCwd =
      cwdRelativePath === '.' ||
      cwdRelativePath === '' ||
      cwdRelativePath === '/';
    if (isRootCwd) {
      if (found.size === 1) {
        primaryProjectId = Array.from(found.keys())[0];
      } else {
        const rootDirCandidates = projects.filter(
          p =>
            (p.directory === '.' ||
              p.directory === '' ||
              p.directory === '/') &&
            found.has(p.id)
        );
        if (rootDirCandidates.length === 1) {
          primaryProjectId = rootDirCandidates[0].id;
        } else if (rootDirCandidates.length === 0) {
          primaryProjectId = pickDeepest(found.keys());
        } else {
          primaryProjectId = pickDeepest(rootDirCandidates.map(p => p.id));
        }
      }
    }
  }

  if (wrapperFlags.logs && !primaryProjectId) {
    output.warn(
      `No deployment is attached to the current directory (cwd: ${chalk.dim(
        cwdRelativePath
      )}). Build logs are only shown when cwd is inside a linked project directory — or at repo root when a single project matches.`
    );
    return gitExit;
  }

  if (!primaryProjectId) {
    if (found.size === 1) {
      const onlyId = Array.from(found.keys())[0];
      const onlyDep = found.get(onlyId)!;
      output.print(
        `\n  ${chalk.dim(`→ Build logs not auto-attached (cwd outside project root). Try:`)} ${chalk.cyan(
          `vc inspect ${onlyDep.id} --logs`
        )}\n`
      );
    }
    return gitExit;
  }

  const primaryProj = projects.find(p => p.id === primaryProjectId)!;
  const primaryDep = found.get(primaryProjectId)!;

  if (
    (primaryDep.readyState === 'READY' ||
      primaryDep.readyState === 'ERROR' ||
      primaryDep.readyState === 'CANCELED') &&
    !shouldForceLog
  ) {
    if (primaryDep.readyState !== 'READY') {
      output.print(
        `${chalk.yellow('⚠')} ${chalk.bold(primaryProj.name)} deployment finished with ${primaryDep.readyState}\n`
      );
    }
    return gitExit;
  }

  output.print('\n');
  output.log(
    `Attaching to deployment for ${chalk.bold(primaryProj.name)} ${chalk.dim(
      `(${primaryProj.directory})`
    )} — streaming build logs. ${chalk.dim('Ctrl+C to detach, deployment continues.')}`
  );

  try {
    await streamDeploymentUntilReady(
      client,
      primaryDep,
      primaryProj,
      shouldAutoLog || shouldForceLog
    );
  } catch (err: any) {
    output.debug(`stream failed: ${err?.stack || err}`);
  }

  return gitExit;
}
