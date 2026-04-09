import { dirname, join, relative } from 'path';
import { normalizePath } from '@vercel/build-utils';
import { outputJSON, readFile, readJSON } from 'fs-extra';
import type { VercelConfig } from '@vercel/client';
import { VERCEL_DIR, VERCEL_DIR_PROJECT, VERCEL_DIR_REPO } from './link';
import {
  findProjectsFromPath,
  findRepoRoot,
  type RepoProjectsConfig,
} from '../link/repo';
import type { PartialProjectSettings } from '../input/edit-project-settings';
import type { Org, Project, ProjectLink } from '@vercel-internals/types';
import { isErrnoException, isError } from '@vercel/error-utils';

export type ProjectLinkAndSettings = Partial<ProjectLink> & {
  settings: {
    createdAt: Project['createdAt'];
    installCommand: Project['installCommand'];
    buildCommand: Project['buildCommand'];
    devCommand: Project['devCommand'];
    outputDirectory: Project['outputDirectory'];
    directoryListing: Project['directoryListing'];
    rootDirectory: Project['rootDirectory'];
    framework: Project['framework'];
    nodeVersion: Project['nodeVersion'];
    analyticsId?: string;
  };
};

// writeProjectSettings writes the project configuration to `vercel/project.json`
// Write the project configuration to `.vercel/project.json`
// that is needed for `vercel build` and `vercel dev` commands.
// Always records `orgId` / `projectId` / `projectName` so monorepo paths can tell
// which Vercel project the pulled settings belong to (see `getProjectLink`).
export async function writeProjectSettings(
  cwd: string,
  project: Project,
  org: Org
) {
  let analyticsId: string | undefined;
  if (
    project.analytics?.id &&
    (!project.analytics.disabledAt ||
      (project.analytics.enabledAt &&
        project.analytics.enabledAt > project.analytics.disabledAt))
  ) {
    analyticsId = project.analytics.id;
  }

  const projectLinkAndSettings: ProjectLinkAndSettings = {
    projectId: project.id,
    orgId: org.id,
    projectName: project.name,
    settings: {
      createdAt: project.createdAt,
      framework: project.framework,
      devCommand: project.devCommand,
      installCommand: project.installCommand,
      buildCommand: project.buildCommand,
      outputDirectory: project.outputDirectory,
      rootDirectory: project.rootDirectory,
      directoryListing: project.directoryListing,
      nodeVersion: project.nodeVersion,
      analyticsId,
    },
  };
  const path = join(cwd, VERCEL_DIR, VERCEL_DIR_PROJECT);
  return await outputJSON(path, projectLinkAndSettings, {
    spaces: 2,
  });
}

export async function readProjectSettings(
  vercelDir: string
): Promise<ProjectLinkAndSettings | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      await readFile(join(vercelDir, VERCEL_DIR_PROJECT), 'utf8')
    );
  } catch (err: unknown) {
    // `project.json` file does not exists, so project settings have not been pulled
    if (
      isErrnoException(err) &&
      err.code &&
      ['ENOENT', 'ENOTDIR'].includes(err.code)
    ) {
      return null;
    }

    // failed to parse JSON, treat the same as if project settings have not been pulled
    if (isError(err) && err.name === 'SyntaxError') {
      return null;
    }

    throw err;
  }

  return (await preferRepoJsonRootDirectory(
    vercelDir,
    parsed
  )) as ProjectLinkAndSettings | null;
}

/**
 * When `.vercel/repo.json` maps the same project (`projectId` / `orgId`) as
 * `project.json`, use that entry's `directory` as `settings.rootDirectory`
 * so local repo link wins over stale dashboard values from pull.
 */
async function preferRepoJsonRootDirectory(
  vercelDir: string,
  parsed: unknown
): Promise<unknown> {
  if (!parsed || typeof parsed !== 'object') {
    return parsed;
  }
  const raw = parsed as ProjectLinkAndSettings & {
    projectId?: string;
    orgId?: string;
  };
  if (!raw.settings) {
    return parsed;
  }
  const projectId = raw.projectId;
  const orgId = raw.orgId;
  if (typeof projectId !== 'string' || typeof orgId !== 'string') {
    return parsed;
  }

  const projectDir = dirname(vercelDir);
  const rootPath = await findRepoRoot(projectDir);
  if (!rootPath) {
    return parsed;
  }

  const repoConfigPath = join(rootPath, VERCEL_DIR, VERCEL_DIR_REPO);
  const repoConfig: RepoProjectsConfig | undefined = await readJSON(
    repoConfigPath
  ).catch((err: unknown) => {
    if (isErrnoException(err) && err.code === 'ENOENT') return undefined;
    throw err;
  });
  if (!repoConfig?.projects?.length) {
    return parsed;
  }

  const rel = normalizePath(relative(rootPath, projectDir));
  const topOrg = repoConfig.orgId;
  const matchesForPath = findProjectsFromPath(repoConfig.projects, rel);
  const row = matchesForPath.find(
    p =>
      p.id === projectId &&
      (p.orgId ?? topOrg) === orgId
  );
  if (!row) {
    return parsed;
  }

  const fromRepo = row.directory;
  const rootDirectory =
    fromRepo === '' || fromRepo === '.' ? null : normalizePath(fromRepo);

  return {
    ...raw,
    settings: {
      ...raw.settings,
      rootDirectory,
    },
  };
}

export function pickOverrides(
  vercelConfig: VercelConfig
): PartialProjectSettings {
  const overrides: PartialProjectSettings = {};
  for (const prop of [
    'buildCommand',
    'devCommand',
    'framework',
    'ignoreCommand',
    'installCommand',
    'outputDirectory',
  ] as const) {
    if (typeof vercelConfig[prop] !== 'undefined') {
      if (prop === 'ignoreCommand') {
        overrides.commandForIgnoringBuildStep = vercelConfig[prop];
      } else {
        overrides[prop] = vercelConfig[prop];
      }
    }
  }
  return overrides;
}
