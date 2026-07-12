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

const GIT_TRIGGER_TIMEOUT_MS = 120_000; // 2 minutes to notice new git deployment
const GIT_POLL_INTERVAL_MS = 3_000;
const READY_POLL_INTERVAL_MS = 3_000;

// Keep API pressure bounded when a monorepo links dozens of projects.
// 6 concurrent fetches is a good tradeoff: fast enough for 30 projects (~5 waves),
// low enough to avoid 429s when every poll iteration fans out.
const GIT_PROJECT_FETCH_CONCURRENCY = 6;
const GIT_ORG_FETCH_CONCURRENCY = 6;

interface ProjectWithMeta extends RepoProjectConfig {
  orgIdResolved: string;
  orgSlug?: string;
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
}) {
  const { client, projects, shas, branchHint, cwdRelativePath } = opts;
  const since = Date.now();
  const deadline = since + GIT_TRIGGER_TIMEOUT_MS;

  const pending = new Map<string, ProjectWithMeta>(
    projects.map(p => [p.id, p])
  );
  const found = new Map<string, Deployment>();

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
    // Don't spam: once up front is enough for 30-project case
    output.print(
      `  ${chalk.dim(`Tracking ${n} projects; showing links as they appear. Full list in Vercel dashboard.`)}\n`
    );
  };
  noticeTruncated(projects.length);

  // Poll loop: bounded concurrency so 30 projects doesn't 429.
  // Also cap banner lines so 30 finds doesn't flood terminal.
  let linesPrinted = 0;
  const MAX_INLINE_PROJECTS = 12;
  let deferredOverflow = 0;

  const flushFound = (
    items: Array<{ proj: ProjectWithMeta; dep: Deployment }>
  ) => {
    for (const { proj, dep } of items) {
      found.set(proj.id, dep);
      pending.delete(proj.id);
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
      // Final overflow summary
      output.print(
        `  ${chalk.dim(`… +${deferredOverflow} more deployments (run ${chalk.cyan('vc ls')} or open dashboard to see all)`)}\n`
      );
      deferredOverflow = -1; // don't print again
    }
  };

  while (Date.now() < deadline && pending.size > 0) {
    const pendingArr = Array.from(pending.values());

    // Capture per-project team context ahead of concurrency (client.config.currentTeam is mutable)
    // so each fetch uses the right account scoping.
    const checks: Array<{ proj: ProjectWithMeta; dep: Deployment | null }> =
      await mapWithConcurrency(
        pendingArr,
        async proj => {
          const teamId = proj.orgIdResolved.startsWith('team_')
            ? proj.orgIdResolved
            : undefined;
          // We don't rely on global client.config.currentTeam here; we pass accountId
          // explicitly. But set currentTeam too for any downstream that still reads it,
          // behind a tiny critical section using a cloned view.
          // Since client isn't thread-safe for currentTeam, we save/restore.
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

    if (pending.size === 0) break;

    await sleepLib(GIT_POLL_INTERVAL_MS);
  }

  if (pending.size > 0) {
    // For large monorepos, collapse the "no deployment" tail so 30 lines doesn't become 30 warnings.
    if (pending.size > 8) {
      output.print(
        `  ${chalk.dim('–')} ${chalk.dim(`${pending.size} projects`)} ${chalk.dim('had no new deployment detected (may be ignored by git config / no changes, or still queuing).')}\n`
      );
      output.print(
        `  ${chalk.dim(
          `Those projects: ${Array.from(pending.values())
            .slice(0, 8)
            .map(p => p.name)
            .join(', ')}${pending.size > 8 ? ', …' : ''}`
        )}\n`
      );
      if (output.isDebugEnabled()) {
        for (const proj of pending.values()) {
          output.debug(`no deployment for ${proj.name} (${proj.directory})`);
        }
      }
    } else {
      for (const proj of pending.values()) {
        output.print(
          `  ${chalk.dim('–')} ${chalk.bold(proj.name)} ${chalk.dim(`(${proj.directory})`)} ${chalk.dim('no new deployment detected (may be ignored by git config / no changes)')}\n`
        );
      }
    }
  }

  if (found.size === 0) {
    return { found, cwdMatchedIds };
  }

  return { found, cwdMatchedIds };
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

  // Poll
  const { found, cwdMatchedIds } = await pollForProjectsDeployments({
    client,
    projects,
    shas,
    branchHint,
    cwdRelativePath,
  });

  if (found.size === 0) {
    return gitExit;
  }

  if (wrapperFlags.noLogs) {
    return gitExit;
  }

  // Determine if we should stream logs.
  // Rules (cli-ux):
  //  - default: stream if cwd is inside a linked project (cwdMatchedIds non-empty)
  //  - --logs forces stream for cwd-matched, even if READY/ERROR (will show what we have + inspect fallback)
  //  - --no-logs disables entirely, handled above
  const shouldAutoLog = !wrapperFlags.noLogs;
  const shouldForceLog = wrapperFlags.logs;

  // Pick project to stream: deepest matching cwd project that has deployment.
  // Fallbacks when cwd is repo root:
  //   - if cwdRelativePath === '.' or cwdMatchedIds empty but exactly one deployment found, attach to that one
  //   - if cwdMatchedIds empty and multiple found but one project has directory '.' (common single-root repo), attach to that
  let primaryProjectId: string | undefined;

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

  if (cwdMatchedIds.size > 0) {
    primaryProjectId = pickDeepest(cwdMatchedIds);
  }

  if (!primaryProjectId) {
    // repo root / un-nested monorepo cwd: try smart defaults so "never picked up log stream" doesn't happen
    const isRootCwd =
      cwdRelativePath === '.' ||
      cwdRelativePath === '' ||
      cwdRelativePath === '/';
    if (isRootCwd) {
      if (found.size === 1) {
        primaryProjectId = Array.from(found.keys())[0];
      } else {
        // Prefer projects with directory '.' or '' (root projects)
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
          // No root project — pick the most recently updated found deployment by primacy?
          // Deepest found is still the best guess for typical usage.
          primaryProjectId = pickDeepest(found.keys());
        } else {
          // Multiple root candidates — pick deepest (they're all same depth 0, so first alphabetical wins deterministically)
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
    // No cwd-matched deployment to tail, and no safe root fallback — links already shown.
    // Preserve git exit code. Hint user how to get logs explicitly.
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

  // If deployment is already done and user didn't force logs, skip streaming
  if (
    (primaryDep.readyState === 'READY' ||
      primaryDep.readyState === 'ERROR' ||
      primaryDep.readyState === 'CANCELED') &&
    !shouldForceLog
  ) {
    // short-circuit still prints final status already done via pollFor...? It printed initial line but not full status. Print final.
    if (primaryDep.readyState !== 'READY') {
      output.print(
        `${chalk.yellow('⚠')} ${chalk.bold(primaryProj.name)} deployment finished with ${primaryDep.readyState}\n`
      );
    }
    return gitExit;
  }

  output.print('\n');
  // Use log() which already emits "> …" at col 0 — don't add another ">" manually; cli-ux forbids double gutters.
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
    // don't fail the git push exit code because deployment continues server-side
  }

  // For other projects, we already showed links; we don't stream them.

  return gitExit;
}
