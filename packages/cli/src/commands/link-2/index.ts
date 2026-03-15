import chalk from 'chalk';
import { join, relative } from 'path';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import { addSubcommand, link2Command } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import {
  collectLinkBaseline,
  type LinkBaseline,
} from '../../util/link/collect-link-baseline';
import { getGitConfigPath } from '../../util/git-helpers';
import { getRemoteUrls } from '../../util/create-git-meta';
import { normalizePath } from '@vercel/build-utils';
import type { Project } from '@vercel-internals/types';
import { ensureDir, outputJSON, readJSON } from 'fs-extra';
import {
  VERCEL_DIR,
  VERCEL_DIR_PROJECT,
  VERCEL_DIR_REPO,
  writeReadme,
} from '../../util/projects/link';
import { addToGitIgnore } from '../../util/link/add-to-gitignore';
import { isErrnoException } from '@vercel/error-utils';
import selectOrg from '../../util/input/select-org';
import createProject from '../../util/projects/create-project';
import { connectGitProvider, parseRepoUrl } from '../../util/git/connect-git-provider';
import pull from '../env/pull';
import { prependEmoji, emoji } from '../../util/emoji';

const COMMAND_CONFIG = {
  add: getCommandAliases(addSubcommand),
};

export default async function link2(client: Client) {
  const flagsSpecification = getFlagsSpecification(link2Command.options);

  // Parse CLI args (permissive to allow subcommand flags to pass through)
  let parsedArgs;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const { subcommand } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: link2Command, columns: client.stderr.columns })
    );
  }

  if (subcommand === 'add') {
    if (parsedArgs.flags['--help']) {
      printHelp(addSubcommand);
      return 2;
    }
    // Stub: just print cwd
    output.log(`link-2 add (stub); cwd: ${client.cwd}`);
    return 0;
  }

  // Default behavior (no subcommand) - re-parse strictly
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(help(link2Command, { columns: client.stderr.columns }));
    return 2;
  }

  const baseline = await collectLinkBaseline(client.cwd, { client });

  const asJson = parsedArgs.flags['--json'];
  if (asJson) {
    const serializable = {
      cwd: baseline.cwd,
      rootPath: baseline.rootPath ?? null,
      detectedProjects: [...baseline.detectedProjects.entries()].map(
        ([dir, fws]) => [dir, fws.map(f => f.slug)]
      ),
      repoJson: baseline.repoJson,
      projectJsonFiles: baseline.projectJsonFiles,
      repo:
        baseline.repo?.map(p => ({
          id: p.id,
          name: p.name,
          accountId: p.accountId,
          rootDirectory: p.rootDirectory,
          link: p.link ? p.link.repo ? {
            repo: p.link.repo,
            org: p.link.org,
          } : p.link.repoId ? {
            repoId: p.link.repoId,
          } : null : null,
        })) ?? null,
      potentialProjects: baseline.potentialProjects.map(p => ({
        id: p.id,
        name: p.name,
        accountId: p.accountId,
        rootDirectory: p.rootDirectory,
        link: p.link ? p.link.repo ? {
          repo: p.link.repo,
          org: p.link.org,
        } : p.link.repoId ? {
          repoId: p.link.repoId,
        } : null : null,
      })),
    };
    output.print(JSON.stringify(serializable, null, 2));
    return 0;
  }

  if (!baseline.rootPath) {
    output.log(`link-2 (stub); cwd: ${client.cwd}; not in a repo`);
    return 0;
  }

  const rootPath = baseline.rootPath;
  const repoProjects: Project[] = baseline.repo ?? [];
  const yes = !!parsedArgs.flags['--yes'];

  // Scope selection (see PLAN §11 — keep as is)
  if (client.stdin.isTTY) {
    const org = await selectOrg(
      client,
      'Which scope should contain your Project(s)?',
      yes
    );
    client.config.currentTeam = org.type === 'team' ? org.id : undefined;
  }

  // --- State for interactive flow (see PLAN §11) ---
  const atRepoRoot = normalizePath(relative(rootPath, baseline.cwd)) === '.' || baseline.cwd === rootPath;
  const cwdRelativePath = normalizePath(relative(rootPath, baseline.cwd)) || '.';
  const cwdFolderName = cwdRelativePath === '.' ? undefined : cwdRelativePath.split('/').filter(Boolean).slice(-1)[0];
  const projectsMatchingCwd: Project[] = repoProjects.filter(
    p => normalizePath(p.rootDirectory || '.') === cwdRelativePath || p.name === cwdFolderName
  );
  const rootProject = repoProjects.find(p => normalizePath(p.rootDirectory || '.') === '.');
  const detectedKeyForCwd = cwdRelativePath === '.' ? '' : cwdRelativePath;
  const frameworkAtCwd = baseline.detectedProjects.get(detectedKeyForCwd);
  const frameworkDetectedAtCwd = !!frameworkAtCwd && frameworkAtCwd.length > 0;
  const potentialMatchCwd =
    cwdFolderName &&
    baseline.potentialProjects.find(p => p.name === cwdFolderName);

  type InteractiveOutcome =
    | { type: 'link_one'; project: Project }
    | { type: 'link_many'; projects: Project[] }
    | { type: 'prompt_link_existing'; project: Project }
    | { type: 'suggest_potential'; project: Project }
    | { type: 'offer_create' }
    | { type: 'skip' };

  let outcome: InteractiveOutcome;

  switch (atRepoRoot) {
    case true: {
      // At repo root (or no repo root handled above)
      switch (true) {
        case repoProjects.length === 0:
          outcome = { type: 'skip' };
          break;
        case repoProjects.length === 1: {
          const single = rootProject;
          outcome = single
            ? { type: 'link_one', project: single }
            : { type: 'link_many', projects: repoProjects };
          break;
        }
        case repoProjects.length >= 1:
          outcome = { type: 'link_many', projects: repoProjects };
          break;
        default:
          outcome = { type: 'skip' };
      }
      break;
    }
    case false: {
      // Not at repo root (in a subfolder)
      switch (true) {
        case projectsMatchingCwd.length === 1: {
          const match = projectsMatchingCwd[0];
          outcome = match
            ? { type: 'prompt_link_existing', project: match }
            : { type: 'skip' };
          break;
        }
        case potentialMatchCwd != null: {
          outcome = {
            type: 'suggest_potential',
            project: potentialMatchCwd as Project,
          };
          break;
        }
        case frameworkDetectedAtCwd:
          outcome = { type: 'offer_create' };
          break;
        default:
          // No matches for this folder; treat as if we're at repo root
          switch (true) {
            case repoProjects.length === 0:
              outcome = { type: 'skip' };
              break;
            case repoProjects.length === 1: {
              const single = rootProject;
              outcome = single
                ? { type: 'link_one', project: single }
                : { type: 'link_many', projects: repoProjects };
              break;
            }
            case repoProjects.length >= 1:
              outcome = { type: 'link_many', projects: repoProjects };
              break;
            default:
              outcome = { type: 'skip' };
          }
          break;
      }
      break;
    }
  }

  let projectsToWrite: Project[] = [];
  let shouldAskPullEnv = false;
  /** When we linked an existing (non-repo) project by name; after write we offer git-connect or new project name. */
  let linkedPotentialProject: Project | null = null;

  switch (outcome.type) {
    case 'link_one': {
      projectsToWrite = [outcome.project];
      shouldAskPullEnv = true;
      break;
    }
    case 'link_many': {
      projectsToWrite = outcome.projects;
      break;
    }
    case 'prompt_link_existing': {
      if (!client.stdin.isTTY && !yes) {
        output.error(
          'Cannot confirm link in non-interactive mode. Use --yes or run in a TTY.'
        );
        return 1;
      }
      const linkToIt =
        yes ||
        (client.stdin.isTTY &&
          (await client.input.confirm(
            `Link to ${chalk.cyan(outcome.project.name)}?`,
            true
          )));
      if (linkToIt) {
        projectsToWrite = [outcome.project];
        shouldAskPullEnv = true;
      }
      break;
    }
    case 'suggest_potential': {
      if (!client.stdin.isTTY && !yes) {
        output.error(
          'Cannot confirm link in non-interactive mode. Use --yes or run in a TTY.'
        );
        return 1;
      }
      const linkToExisting =
        yes ||
        (client.stdin.isTTY &&
          (await client.input.confirm(
            `Link to existing project ${chalk.cyan(outcome.project.name)}?`,
            true
          )));
      if (linkToExisting) {
        const withRoot: Project = {
          ...outcome.project,
          rootDirectory:
            cwdRelativePath === '.' ? undefined : cwdRelativePath,
        };
        projectsToWrite = [...(baseline.repo ?? []), withRoot];
        linkedPotentialProject = outcome.project;
        shouldAskPullEnv = true;
      }
      break;
    }
    case 'offer_create': {
      if (!client.stdin.isTTY && !yes) {
        output.error(
          'Cannot confirm project creation in non-interactive mode. Use --yes or run in a TTY.'
        );
        return 1;
      }
      const frameworkName = frameworkAtCwd?.[0]?.name ?? 'project';
      const suggestedName = cwdFolderName ?? 'my-app';
      const createIt =
        yes ||
        (client.stdin.isTTY &&
          (await client.input.confirm(
            `Create new project ${chalk.cyan(suggestedName)} with ${chalk.cyan(frameworkName)}?`,
            true
          )));
      if (createIt) {
        const gitConfigPath =
          getGitConfigPath({ cwd: rootPath }) ?? join(rootPath, '.git/config');
        const remoteUrls = await getRemoteUrls(gitConfigPath);
        const repoUrl =
          remoteUrls?.origin ?? (remoteUrls && Object.values(remoteUrls)[0]);
        const parsed = repoUrl ? parseRepoUrl(repoUrl) : null;
        if (!parsed) {
          output.error('Could not parse Git remote URL to connect the new project.');
          return 1;
        }
        output.spinner(`Creating project ${suggestedName}…`);
        const newProject = await createProject(client, {
          name: suggestedName,
          framework: frameworkAtCwd?.[0]?.slug ?? undefined,
        });
        output.stopSpinner();
        const connectResult = await connectGitProvider(
          client,
          newProject.id,
          parsed.provider,
          `${parsed.org}/${parsed.repo}`
        );
        if (connectResult === 1) return 1;
        const projectWithRoot: Project = {
          ...newProject,
          rootDirectory: cwdRelativePath === '.' ? undefined : cwdRelativePath,
        };
        projectsToWrite = [...(baseline.repo ?? []), projectWithRoot];
        shouldAskPullEnv = true;
        output.log(
          prependEmoji(
            `Created ${chalk.bold(newProject.name)} and connected to Git`,
            emoji('link')
          )
        );
      }
      break;
    }
    case 'skip':
      output.log('No project to link.');
      break;
  }

  type WrittenRepoProject = {
    id: string;
    name: string;
    directory: string;
    workPath?: string;
    orgId?: string;
  };

  /** Infer workPath from detected dirs where folder name matches project name (e.g. web-21 → apps/web-21). */
  function inferWorkPathFromDetected(
    projectName: string,
    detectedProjects: Map<string, unknown>
  ): string | undefined {
    const matches: string[] = [];
    for (const detectedDir of detectedProjects.keys()) {
      const segments = detectedDir.split('/').filter(Boolean);
      const folderName = segments[segments.length - 1];
      if (folderName === projectName) {
        matches.push(normalizePath(detectedDir) || '.');
      }
    }
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      const exact = matches.find(m => m === projectName);
      return exact ?? matches[0];
    }
    return undefined;
  }

  async function writeRepoAndProjectFiles(
    root: string,
    projects: Project[],
    projectJsonFiles: LinkBaseline['projectJsonFiles'],
    detectedProjects: Map<string, unknown>
  ): Promise<WrittenRepoProject[]> {
    const existingPathByProjectId = new Map<string, string>();
    for (const entry of projectJsonFiles) {
      const id = entry.content?.projectId;
      if (typeof id === 'string') {
        const path = normalizePath(entry.projectRoot);
        existingPathByProjectId.set(id, path);
      }
    }
    const gitConfigPath =
      getGitConfigPath({ cwd: root }) ?? join(root, '.git/config');
    const remoteUrls = await getRemoteUrls(gitConfigPath);
    const remoteName =
      remoteUrls?.origin ?? (remoteUrls && Object.keys(remoteUrls)[0]) ?? 'origin';
    const repoConfig = {
      remoteName,
      projects: projects.map(p => {
        const dir = normalizePath(p.rootDirectory || '.');
        const workPath =
          existingPathByProjectId.get(p.id) ??
          inferWorkPathFromDetected(p.name, detectedProjects) ??
          dir;
        return {
          id: p.id,
          name: p.name,
          directory: dir,
          workPath,
          orgId: p.accountId,
        };
      }),
    };
    await ensureDir(join(root, VERCEL_DIR));
    await outputJSON(join(root, VERCEL_DIR, VERCEL_DIR_REPO), repoConfig, {
      spaces: 2,
    });
    for (const p of projects) {
      const dir = normalizePath(p.rootDirectory || '.');
      const workPath =
        existingPathByProjectId.get(p.id) ??
        inferWorkPathFromDetected(p.name, detectedProjects) ??
        dir;
      const projectRootDir = workPath === '.' ? root : join(root, workPath);
      const vercelDir = join(projectRootDir, VERCEL_DIR);
      await ensureDir(vercelDir);
      const projectJsonPath = join(vercelDir, VERCEL_DIR_PROJECT);
      let existing: Record<string, unknown> = {};
      try {
        existing = await readJSON(projectJsonPath);
      } catch (err) {
        if (!isErrnoException(err) || err.code !== 'ENOENT') throw err;
      }
      const merged = {
        ...existing,
        projectId: p.id,
        orgId: p.accountId,
        projectName: p.name,
      };
      await outputJSON(projectJsonPath, merged, { spaces: 2 });
      await writeReadme(projectRootDir);
      await addToGitIgnore(projectRootDir);
    }
    return repoConfig.projects;
  }

  // Write repo.json and project.json for selected projects
  if (projectsToWrite.length > 0) {
    const writtenProjects = await writeRepoAndProjectFiles(
      rootPath,
      projectsToWrite,
      baseline.projectJsonFiles,
      baseline.detectedProjects
    );

    // If we linked a potential (existing unconnected) project, offer git-connect or new project name
    if (linkedPotentialProject) {
      const connectRepo =
        yes ||
        (client.stdin.isTTY &&
          (await client.input.confirm(
            `Connect this repo to ${chalk.cyan(linkedPotentialProject.name)}?`,
            true
          )));
      if (connectRepo) {
        const gitConfigPath =
          getGitConfigPath({ cwd: rootPath }) ?? join(rootPath, '.git/config');
        const remoteUrls = await getRemoteUrls(gitConfigPath);
        const repoUrl =
          remoteUrls?.origin ?? (remoteUrls && Object.values(remoteUrls)[0]);
        const parsed = repoUrl ? parseRepoUrl(repoUrl) : null;
        if (!parsed) {
          output.error('Could not parse Git remote URL to connect the project.');
          return 1;
        }
        const connectResult = await connectGitProvider(
          client,
          linkedPotentialProject.id,
          parsed.provider,
          `${parsed.org}/${parsed.repo}`
        );
        if (connectResult === 1) return 1;
        // Optionally update project Root Directory on the API to match this folder
        if (cwdRelativePath !== '.') {
          const updateRootDir =
            yes ||
            (client.stdin.isTTY &&
              (await client.input.confirm(
                `Set Root Directory to ${chalk.cyan(cwdRelativePath)} for this project?`,
                true
              )));
          if (updateRootDir) {
            await client.fetch(`/v9/projects/${linkedPotentialProject.id}`, {
              method: 'PATCH',
              body: { rootDirectory: cwdRelativePath },
              accountId: linkedPotentialProject.accountId,
            });
          }
        }
        output.print(
          prependEmoji(
            `Linked to ${chalk.cyan(linkedPotentialProject.name)}`,
            emoji('link')
          ) + '\n'
        );
        output.print(chalk.gray(`   ${VERCEL_DIR} updated`) + '\n');
      } else {
        const newName =
          yes && cwdFolderName
            ? cwdFolderName
            : client.stdin.isTTY
              ? await client.input.text({
                  message: 'New project name:',
                  default: cwdFolderName ?? 'my-app',
                })
              : cwdFolderName ?? 'my-app';
        const gitConfigPathNew =
          getGitConfigPath({ cwd: rootPath }) ?? join(rootPath, '.git/config');
        const remoteUrlsForNew = await getRemoteUrls(gitConfigPathNew);
        const repoUrlForNew =
          remoteUrlsForNew?.origin ??
          (remoteUrlsForNew && Object.values(remoteUrlsForNew)[0]);
        const parsedNew = repoUrlForNew ? parseRepoUrl(repoUrlForNew) : null;
        if (!parsedNew) {
          output.error('Could not parse Git remote URL.');
          return 1;
        }
        output.spinner(`Creating project ${newName}…`);
        const newProject = await createProject(client, {
          name: newName,
          framework: frameworkAtCwd?.[0]?.slug ?? undefined,
        });
        output.stopSpinner();
        const connectResult = await connectGitProvider(
          client,
          newProject.id,
          parsedNew.provider,
          `${parsedNew.org}/${parsedNew.repo}`
        );
        if (connectResult === 1) return 1;
        const newProjectWithRoot: Project = {
          ...newProject,
          rootDirectory:
            cwdRelativePath === '.' ? undefined : cwdRelativePath,
        };
        projectsToWrite = [...(baseline.repo ?? []), newProjectWithRoot];
        await writeRepoAndProjectFiles(
          rootPath,
          projectsToWrite,
          baseline.projectJsonFiles,
          baseline.detectedProjects
        );
        output.print(
          prependEmoji(
            `Created and linked ${chalk.cyan(newProject.name)}`,
            emoji('link')
          ) + '\n'
        );
        output.print(chalk.gray(`   ${VERCEL_DIR} updated`) + '\n');
      }
    } else {
      // When in a project subfolder, only mention that project; at repo root show full list
      const linkedProjectForCwd =
        !atRepoRoot &&
        projectsToWrite.find(
          p => normalizePath(p.rootDirectory || '.') === cwdRelativePath
        );

      if (linkedProjectForCwd) {
        output.print(
          prependEmoji(
            `Linked to ${chalk.cyan(linkedProjectForCwd.name)}`,
            emoji('link')
          ) + '\n'
        );
        output.print(chalk.gray(`   ${VERCEL_DIR} updated`) + '\n');
      } else {
        const summaryLines = writtenProjects.map(
          p =>
            `   ${chalk.gray('•')} ${chalk.cyan(p.name)} ${chalk.gray(
              `(${(p.workPath ?? p.directory) || '.'})`
            )}`
        );
        output.print(
          prependEmoji(
            `Linked ${writtenProjects.length} project(s):`,
            emoji('link')
          ) + '\n'
        );
        output.print(summaryLines.join('\n') + '\n');
        output.print(
          chalk.gray(`   ${VERCEL_DIR} updated`) + '\n'
        );
      }
    }

    if (shouldAskPullEnv && client.stdin.isTTY) {
      const pullEnvConfirmed =
        yes ||
        (await client.input.confirm(
          'Would you like to pull environment variables now?',
          true
        ));
      if (pullEnvConfirmed) {
        const originalCwd = client.cwd;
        try {
          client.cwd = baseline.cwd;
          const exitCode = await pull(
            client,
            yes ? ['--yes'] : [],
            'vercel-cli:link'
          );
          if (exitCode !== 0) {
            output.error(
              'Failed to pull environment variables. You can run `vercel env pull` manually.'
            );
          }
        } finally {
          client.cwd = originalCwd;
        }
      }
    }
  } else if (outcome.type === 'skip' && baseline.repo !== null && baseline.repo.length === 0) {
    output.log('No projects linked to this repo.');
  } else if (outcome.type === 'skip' && baseline.repo === null) {
    const detectedCount = baseline.detectedProjects.size;
    const repoProjectCount = baseline.repoJson?.projects?.length ?? 0;
    const projectJsonCount = baseline.projectJsonFiles.length;
    output.log(
      `link-2: root: ${baseline.rootPath}; detected: ${detectedCount} project(s); repo.json: ${repoProjectCount} project(s); project.json files: ${projectJsonCount} (no API repo data)`
    );
  }
  return 0;
}
