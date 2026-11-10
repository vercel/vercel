import type Client from '../client';
import type { ProjectLink } from '@vercel-internals/types';
import type { ProjectLinkAndSettings } from '../projects/project-settings';
import { DescribeError } from './error';
import { findProjectsFromPath, getRepoLink } from '../link/repo';
import { getLinkFromDir, getProjectLink } from '../projects/link';
import { join, relative } from 'node:path';
import { resolvePerDirectoryLinkRoot } from '../build/repo-root';

export async function resolveDescribeProject(client: Client) {
  try {
    const link = await getLinkFromDir<
      ProjectLink & Partial<ProjectLinkAndSettings>
    >(join(client.cwd, '.vercel'));
    if (link) {
      const { repoRoot, resolvedRootDirectory } = resolvePerDirectoryLinkRoot(
        client.cwd,
        link.settings?.rootDirectory
      );
      return {
        ...link,
        directory: join(repoRoot, resolvedRootDirectory),
        repoRootPath: repoRoot,
      };
    }

    const repo = await getRepoLink(client, client.cwd);
    if (!repo?.repoConfig?.projects.length) {
      throw new DescribeError(
        'not_linked',
        'No linked project found. Run `vercel link`, or restore CI project settings with `vercel pull --yes`.'
      );
    }

    const matches = findProjectsFromPath(
      repo.repoConfig.projects,
      relative(repo.rootPath, client.cwd)
    );
    const candidates = matches.length ? matches : repo.repoConfig.projects;
    if (candidates.length !== 1) {
      throw new DescribeError(
        'ambiguous_project',
        'Multiple projects are linked here. Run this command from the intended project directory, or pass --cwd <PROJECT_DIRECTORY>.'
      );
    }

    // Resolve the known project through the shared link helper without prompting.
    const project = await getProjectLink(
      client,
      client.cwd,
      candidates[0].id,
      true
    );
    if (!project?.repoRoot) {
      throw new Error('Project link changed');
    }
    return {
      ...project,
      directory: join(project.repoRoot, project.projectRootDirectory || ''),
      repoRootPath: project.repoRoot,
    };
  } catch (error) {
    if (error instanceof DescribeError) throw error;
    throw new DescribeError(
      'invalid_project_link',
      'Could not read the local project link. Check that .vercel/project.json or .vercel/repo.json is readable and contains valid project settings.'
    );
  }
}
