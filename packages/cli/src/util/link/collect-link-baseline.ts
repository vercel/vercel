import { join, relative } from 'path';
import { pathExists, readdir, readJSON } from 'fs-extra';
import { findRepoRoot } from './repo';
import { detectProjects } from '../projects/detect-projects';
import {
  VERCEL_DIR,
  VERCEL_DIR_PROJECT,
  VERCEL_DIR_REPO,
} from '../projects/link';
import { getGitConfigPath } from '../git-helpers';
import { getRemoteUrls } from '../create-git-meta';
import { parseRepoUrl } from '../git/connect-git-provider';
import type { RepoProjectsConfig } from './repo';
import type { Framework } from '@vercel/frameworks';
import type { Project } from '@vercel-internals/types';
import type Client from '../client';
import { isErrnoException } from '@vercel/error-utils';
import output from '../../output-manager';

const API_DISCOVERY_TIMEOUT_MS = 15_000;

/**
 * Parsed content of a `.vercel/project.json` file.
 * May contain only project settings (no projectId/orgId) when link is via repo.json.
 */
export interface ProjectJsonContent {
  projectId?: string;
  orgId?: string;
  projectName?: string;
  [key: string]: unknown;
}

/**
 * One discovered project.json file: path relative to repo root (directory containing .vercel) and parsed content.
 * Each entry corresponds to an actual file on disk at projectRoot/.vercel/project.json (relative to repo root).
 */
export interface ProjectJsonEntry {
  /** Directory containing .vercel (project root), relative to repo root. Use '.' for repo root. */
  projectRoot: string;
  /** Absolute path to the .vercel/project.json file (for verification). */
  filePath: string;
  content: ProjectJsonContent;
}

/**
 * Baseline data collected for link-2: (a) detected projects, (d) repo.json, (e) all project.json files,
 * plus when client is provided: repo (API projects for this repo), potentialProjects (name-match, not linked elsewhere).
 */
export interface LinkBaseline {
  /** Current working directory passed to collectLinkBaseline. */
  cwd: string;
  /** Repo root path, or undefined if not in a repo. */
  rootPath: string | undefined;
  /** (a) Detected workspace package paths → frameworks. Directory is relative to rootPath ('' for root). */
  detectedProjects: Map<string, Framework[]>;
  /** (d) Parsed repo.json at repo root, or null if missing. May be stale or incomplete. */
  repoJson: RepoProjectsConfig | null;
  /** (e) All .vercel/project.json files under repo root. May be stale or incomplete. */
  projectJsonFiles: ProjectJsonEntry[];
  /** Projects attached to this repo that the token has access to (API). Present when client is provided and repo URL is available. */
  repo: Project[] | null;
  /** Projects that match a detected folder name and are not linked to another git repo (suggest link). Present when client is provided. */
  potentialProjects: Project[];
}

export interface CollectLinkBaselineOptions {
  /** When provided, fetches repo (projects by repo URL) and potentialProjects (by folder name, excluding linked-to-other-repo). */
  client?: Client;
  /** Pre-resolved team IDs to query. When provided, skips the /v1/teams fetch inside discovery. */
  teamIds?: string[];
}

const REPO_JSON = VERCEL_DIR_REPO;
const PROJECT_JSON = VERCEL_DIR_PROJECT;

/**
 * Recursively find all paths under root that are the parent of a .vercel/project.json file.
 * Returns paths relative to root (directory containing .vercel).
 */
async function findProjectJsonPaths(
  root: string,
  currentDir: string
): Promise<string[]> {
  const fullPath = currentDir === '.' ? root : join(root, currentDir);
  const entries = await readdir(fullPath, { withFileTypes: true }).catch(
    err => {
      if (isErrnoException(err) && err.code === 'ENOENT') return [];
      throw err;
    }
  );

  const results: string[] = [];
  for (const ent of entries) {
    if (ent.isDirectory()) {
      if (ent.name === VERCEL_DIR) {
        const exists = await pathExists(
          join(fullPath, VERCEL_DIR, PROJECT_JSON)
        );
        if (exists) {
          results.push(currentDir === '.' ? '.' : currentDir);
        }
      } else if (ent.name !== 'node_modules' && !ent.name.startsWith('.')) {
        const nextDir =
          currentDir === '.' ? ent.name : `${currentDir}/${ent.name}`;
        results.push(...(await findProjectJsonPaths(root, nextDir)));
      }
    }
  }
  return results;
}

/** Derive a project name from a detected directory for matching (e.g. apps/api → api, '' → repo name). */
function folderNameForMatching(
  directory: string,
  repoName: string | undefined
): string {
  if (directory === '' || directory === '.') {
    return repoName ?? 'root';
  }
  const segments = directory.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? repoName ?? 'root';
}

interface ApiDiscoveryResult {
  repo: Project[] | null;
  potentialProjects: Project[];
  currentRepoOrgRepo: string | null;
  repoName: string | undefined;
}

async function discoverProjectsFromApiInner(
  client: Client,
  rootPath: string,
  cwd: string,
  detectedProjects: Map<string, Framework[]>,
  teamIds?: string[]
): Promise<ApiDiscoveryResult> {
  const gitConfigPath =
    getGitConfigPath({ cwd: rootPath }) ?? join(rootPath, '.git/config');
  const remoteUrls = await getRemoteUrls(gitConfigPath);
  const repoUrl =
    remoteUrls?.origin ?? (remoteUrls && Object.values(remoteUrls)[0]);
  const parsed = repoUrl ? parseRepoUrl(repoUrl) : null;
  const repoName = parsed?.repo;

  let currentRepoOrgRepo: string | null = null;
  let repo: Project[] | null = null;
  const potentialProjects: Project[] = [];

  /** Single-page fetch (no pagination) — keeps request count bounded. */
  async function fetchOnePage(
    url: string,
    accountId: string | undefined
  ): Promise<Project[]> {
    const opts = accountId
      ? { accountId, skipSAMLReauth: true }
      : { useCurrentTeam: false, skipSAMLReauth: true };
    try {
      const body = await client.fetch<{ projects: Project[] }>(url, opts);
      return body.projects ?? [];
    } catch {
      return [];
    }
  }

  const scopes: Array<string | undefined> = [undefined, ...(teamIds ?? [])];

  // 1. Find projects connected to this git repo (filtered server-side, small result set).
  if (parsed && repoUrl) {
    currentRepoOrgRepo = `${parsed.org}/${parsed.repo}`;
    const query = new URLSearchParams({ repoUrl, limit: '100' });
    const endpoint = `/v9/projects?${query}`;

    const settled = await Promise.allSettled(
      scopes.map(id => fetchOnePage(endpoint, id))
    );
    const seenIds = new Set<string>();
    const repoList: Project[] = [];
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const p of result.value) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          repoList.push(p);
        }
      }
    }
    repo = repoList;
  } else {
    repo = [];
  }

  // 2. Search for projects matching the CWD folder name only (not all workspace paths).
  const cwdRel = relative(rootPath, cwd).replace(/\\/g, '/') || '.';
  const cwdFolderName = folderNameForMatching(cwdRel, repoName);

  if (cwdFolderName) {
    const query = new URLSearchParams({ search: cwdFolderName, limit: '20' });
    const endpoint = `/v9/projects?${query}`;
    const searchPromises = scopes.map(id => fetchOnePage(endpoint, id));

    const settled = await Promise.allSettled(searchPromises);
    const seen = new Set<string>();
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const p of result.value) {
        if (p.name !== cwdFolderName || seen.has(p.id)) continue;
        const linkOrgRepo = p.link?.repo
          ? p.link.repo.includes('/')
            ? p.link.repo
            : p.link.org
              ? `${p.link.org}/${p.link.repo}`
              : p.link.repo
          : null;
        const linkedToOtherRepo =
          currentRepoOrgRepo &&
          linkOrgRepo &&
          linkOrgRepo !== currentRepoOrgRepo;
        if (!linkedToOtherRepo) {
          seen.add(p.id);
          potentialProjects.push(p);
        }
      }
    }
  }

  return { repo, potentialProjects, currentRepoOrgRepo, repoName };
}

/**
 * Runs all API discovery with a hard timeout.
 * If anything hangs (slow endpoint, SAML, network), we fall back to local-only data.
 */
async function discoverProjectsFromApi(
  client: Client,
  rootPath: string,
  cwd: string,
  detectedProjects: Map<string, Framework[]>,
  teamIds?: string[]
): Promise<ApiDiscoveryResult> {
  try {
    const result = discoverProjectsFromApiInner(
      client,
      rootPath,
      cwd,
      detectedProjects,
      teamIds
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('API discovery timed out')),
        API_DISCOVERY_TIMEOUT_MS
      );
    });
    try {
      return await Promise.race([result, timeout]);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    output.warn(`Project discovery failed: ${msg}`);
    output.debug(
      `Cross-team API discovery skipped: ${err instanceof Error ? err.stack : err}`
    );
    return {
      repo: null,
      potentialProjects: [],
      currentRepoOrgRepo: null,
      repoName: undefined,
    };
  }
}

/**
 * Gather baseline data for link-2: repo root, detected projects (a), repo.json (d), all project.json files (e),
 * and when client is provided: repo (API projects for this repo), potentialProjects (name match, not linked to another repo).
 */
export async function collectLinkBaseline(
  cwd: string,
  options?: CollectLinkBaselineOptions
): Promise<LinkBaseline> {
  const client = options?.client;
  const rootPath = await findRepoRoot(cwd);
  if (!rootPath) {
    return {
      cwd,
      rootPath: undefined,
      detectedProjects: new Map(),
      repoJson: null,
      projectJsonFiles: [],
      repo: client ? null : null,
      potentialProjects: client ? [] : [],
    };
  }

  const [detectedProjects, repoJson, projectJsonPaths] = await Promise.all([
    detectProjects(rootPath),
    readJSON(join(rootPath, VERCEL_DIR, REPO_JSON)).catch(err => {
      if (isErrnoException(err) && err.code === 'ENOENT') return null;
      throw err;
    }) as Promise<RepoProjectsConfig | null>,
    findProjectJsonPaths(rootPath, '.'),
  ]);

  const projectJsonFiles: ProjectJsonEntry[] = await Promise.all(
    projectJsonPaths.map(async projectRoot => {
      const fullDir =
        projectRoot === '.' ? rootPath : join(rootPath, projectRoot);
      const filePath = join(fullDir, VERCEL_DIR, PROJECT_JSON);
      const content = await readJSON(filePath).catch(err => {
        if (isErrnoException(err) && err.code === 'ENOENT') return {};
        throw err;
      });
      return {
        projectRoot: projectRoot === '.' ? '.' : projectRoot,
        filePath,
        content: content as ProjectJsonContent,
      };
    })
  );

  let repo: Project[] | null = null;
  let potentialProjects: Project[] = [];

  if (client) {
    const apiResult = await discoverProjectsFromApi(
      client,
      rootPath,
      cwd,
      detectedProjects,
      options?.teamIds
    );
    repo = apiResult.repo;
    potentialProjects = apiResult.potentialProjects;
  }

  return {
    cwd,
    rootPath,
    detectedProjects,
    repoJson,
    projectJsonFiles,
    repo,
    potentialProjects,
  };
}
