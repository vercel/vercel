import { join, relative } from 'path';
import { readdir, stat } from 'fs/promises';
import {
  getLinkFromDir,
  VERCEL_DIR,
  VERCEL_DIR_FALLBACK,
} from '../projects/link';
import { getRepoLink } from './repo';
import type Client from '../client';

export interface ProjectLinkInfo {
  path: string;
  orgId: string;
  projectId: string;
}

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.vercel',
  '.now',
  '.next',
  'dist',
  'build',
  '.turbo',
  '.cache',
  '.output',
  '__pycache__',
  '.venv',
  'venv',
]);

async function findProjectLinksRecursive(
  basePath: string,
  currentPath: string,
  results: ProjectLinkInfo[],
  maxDepth: number,
  currentDepth: number
): Promise<void> {
  if (maxDepth > 0 && currentDepth > maxDepth) {
    return;
  }

  const vercelDir = join(currentPath, VERCEL_DIR);
  const vercelDirFallback = join(currentPath, VERCEL_DIR_FALLBACK);

  let linkDir: string | null = null;
  try {
    const vercelStat = await stat(vercelDir);
    if (vercelStat.isDirectory()) {
      linkDir = vercelDir;
    }
  } catch {
    try {
      const fallbackStat = await stat(vercelDirFallback);
      if (fallbackStat.isDirectory()) {
        linkDir = vercelDirFallback;
      }
    } catch {
      // Neither directory exists
    }
  }

  if (linkDir) {
    const link = await getLinkFromDir(linkDir);
    if (link) {
      const relativePath = relative(basePath, currentPath) || '.';
      results.push({
        path: relativePath,
        orgId: link.orgId,
        projectId: link.projectId,
      });
    }
  }

  let entries: string[];
  try {
    entries = await readdir(currentPath);
  } catch {
    return;
  }

  const subdirPromises: Promise<void>[] = [];

  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry)) {
      continue;
    }

    const entryPath = join(currentPath, entry);
    try {
      const entryStat = await stat(entryPath);
      if (entryStat.isDirectory()) {
        subdirPromises.push(
          findProjectLinksRecursive(
            basePath,
            entryPath,
            results,
            maxDepth,
            currentDepth + 1
          )
        );
      }
    } catch {
      // Skip entries we can't stat
    }
  }

  await Promise.all(subdirPromises);
}

export async function findLocalProjectLinks(
  cwd: string,
  options?: { maxDepth?: number }
): Promise<ProjectLinkInfo[]> {
  const results: ProjectLinkInfo[] = [];
  const maxDepth = options?.maxDepth ?? 0;

  await findProjectLinksRecursive(cwd, cwd, results, maxDepth, 0);

  results.sort((a, b) => {
    if (a.path === '.') return -1;
    if (b.path === '.') return 1;
    return a.path.localeCompare(b.path);
  });

  return results;
}

export async function findAllProjectLinks(
  client: Client,
  cwd: string
): Promise<ProjectLinkInfo[]> {
  const results = new Map<string, ProjectLinkInfo>();

  const repoLink = await getRepoLink(client, cwd);
  if (repoLink?.repoConfig) {
    for (const project of repoLink.repoConfig.projects) {
      const projectPath = project.directory === '.' ? '' : project.directory;
      const relativeToRoot = relative(repoLink.rootPath, cwd);

      const isProjectUnderCwd =
        relativeToRoot === '' ||
        projectPath === relativeToRoot ||
        projectPath.startsWith(`${relativeToRoot}/`);

      const isCwdUnderProject =
        projectPath === '' ||
        relativeToRoot === projectPath ||
        relativeToRoot.startsWith(`${projectPath}/`);

      if (isProjectUnderCwd || isCwdUnderProject) {
        let displayPath: string;
        if (relativeToRoot === '') {
          displayPath = projectPath || '.';
        } else if (projectPath.startsWith(`${relativeToRoot}/`)) {
          displayPath = projectPath.slice(relativeToRoot.length + 1);
        } else if (
          relativeToRoot === projectPath ||
          relativeToRoot.startsWith(`${projectPath}/`)
        ) {
          displayPath = '.';
        } else {
          displayPath = projectPath || '.';
        }

        results.set(displayPath, {
          path: displayPath,
          orgId: repoLink.repoConfig.orgId,
          projectId: project.id,
        });
      }
    }
  }

  const localLinks = await findLocalProjectLinks(cwd, { maxDepth: 5 });
  for (const link of localLinks) {
    if (!results.has(link.path)) {
      results.set(link.path, link);
    }
  }

  const sortedResults = Array.from(results.values()).sort((a, b) => {
    if (a.path === '.') return -1;
    if (b.path === '.') return 1;
    return a.path.localeCompare(b.path);
  });

  return sortedResults;
}
