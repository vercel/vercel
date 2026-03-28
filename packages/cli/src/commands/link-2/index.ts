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
import type { Framework } from '@vercel/frameworks';
import type { Project } from '@vercel-internals/types';
import { ensureDir, outputJSON, pathExists, readJSON } from 'fs-extra';
import {
  VERCEL_DIR,
  VERCEL_DIR_PROJECT,
  VERCEL_DIR_REPO,
  writeReadme,
} from '../../util/projects/link';
import { addToGitIgnore } from '../../util/link/add-to-gitignore';
import { findRepoRoot } from '../../util/link/repo';
import type {
  RepoProjectsConfig,
  RepoProjectConfig,
} from '../../util/link/repo';
import { detectProjects } from '../../util/projects/detect-projects';
import { ensureLinkLegacy } from '../../util/link/ensure-link';
import { isErrnoException } from '@vercel/error-utils';
import selectOrg from '../../util/input/select-org';
import createProject from '../../util/projects/create-project';
import {
  connectGitProvider,
  parseRepoUrl,
} from '../../util/git/connect-git-provider';
import pull from '../env/pull';
import { prependEmoji, emoji } from '../../util/emoji';

const frameworkColors: Record<string, (text: string) => string> = {
  nextjs: chalk.white,
  vite: chalk.magenta,
  nuxtjs: chalk.green,
  remix: chalk.cyan,
  astro: chalk.magenta,
  gatsby: chalk.magenta,
  svelte: chalk.red,
  sveltekit: chalk.red,
  solidstart: chalk.blue,
  angular: chalk.red,
  vue: chalk.green,
  ember: chalk.red,
  preact: chalk.magenta,
  fastapi: chalk.green,
  flask: chalk.cyan,
  express: chalk.yellow,
  nest: chalk.red,
  hono: chalk.hex('#FFA500'),
};

const frameworkEmoji: Record<string, string> = {
  hono: '🔥',
  nextjs: '▲',
};

function styledFramework(fw: Framework): string {
  const colorFn = (fw.slug && frameworkColors[fw.slug]) || chalk.blue;
  const emojiStr = fw.slug && frameworkEmoji[fw.slug];
  const label = emojiStr ? `${emojiStr} ${fw.name}` : fw.name;
  return colorFn(label);
}

/** Prompt for team/personal scope only when creating a new project; sets currentTeam for the API. */
async function selectOrgForNewProject(client: Client, autoConfirm: boolean) {
  const org = await selectOrg(
    client,
    'Which scope should your new Project be created under?',
    autoConfirm
  );
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;
  return org;
}

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

  const asJson = !!parsedArgs.flags['--json'];
  const skipPull = !!parsedArgs.flags['--skip-pull'];
  const yes = !!parsedArgs.flags['--yes'];

  // Fast path: if in a subfolder and repo.json already has this project, skip discovery.
  const earlyRootPath = await findRepoRoot(client.cwd);
  if (earlyRootPath) {
    const repoJsonPath = join(earlyRootPath, VERCEL_DIR, VERCEL_DIR_REPO);
    let existingRepoJson: RepoProjectsConfig | null = null;
    try {
      existingRepoJson = await readJSON(repoJsonPath);
    } catch (err) {
      if (!isErrnoException(err) || err.code !== 'ENOENT') throw err;
    }

    const cwdRel = normalizePath(relative(earlyRootPath, client.cwd)) || '.';
    const atRoot = cwdRel === '.' || client.cwd === earlyRootPath;

    // Subfolder early exit: already linked for this CWD
    if (!atRoot && existingRepoJson && existingRepoJson.projects?.length > 0) {
      const cwdProject = existingRepoJson.projects.find(
        p =>
          normalizePath(p.directory || '.') === cwdRel ||
          normalizePath(p.workPath || p.directory || '.') === cwdRel
      );
      if (cwdProject) {
        if (!asJson) {
          output.print(
            prependEmoji(
              `Already linked to ${chalk.cyan(cwdProject.name)}`,
              emoji('link')
            ) + '\n'
          );
        }
        if (asJson) {
          output.print(
            JSON.stringify(
              {
                linked: {
                  id: cwdProject.id,
                  name: cwdProject.name,
                  directory: cwdProject.directory,
                  workPath: cwdProject.workPath,
                },
              },
              null,
              2
            )
          );
        }
        return 0;
      }
    }

    // Repo root: show workspace selector so user can choose which folders to link
    if (atRoot && existingRepoJson) {
      const detectedWorkspaces = await detectProjects(earlyRootPath);
      const existingDirs = new Set(
        (existingRepoJson.projects ?? []).map(p =>
          normalizePath(p.directory || '.')
        )
      );
      const existingByDir = new Map<string, RepoProjectConfig>();
      for (const p of existingRepoJson.projects ?? []) {
        existingByDir.set(normalizePath(p.directory || '.'), p);
      }

      // Build choices: every detected workspace, plus existing projects not in detected
      const allDirs = new Set([...detectedWorkspaces.keys(), ...existingDirs]);
      // Remove root '.' / '' — the root is handled separately or as a choice
      const sortedDirs = [...allDirs]
        .map(d => normalizePath(d || '.'))
        .filter(d => d !== '.' && d !== '')
        .sort();

      if (sortedDirs.length === 0) {
        // No workspaces detected and no existing projects (or only root)
        // Fall through to normal discovery flow
      } else if (yes || client.nonInteractive) {
        // --yes / non-interactive: keep existing, don't add new ones
        if (existingRepoJson.projects?.length > 0) {
          if (!asJson) {
            const summaryLines = existingRepoJson.projects.map(
              p =>
                `   ${chalk.gray('•')} ${chalk.cyan(p.name)} ${chalk.gray(
                  `(${p.workPath ?? p.directory ?? '.'})`
                )}`
            );
            output.print(
              prependEmoji(
                `Linked ${existingRepoJson.projects.length} project(s):`,
                emoji('link')
              ) + '\n'
            );
            output.print(summaryLines.join('\n') + '\n');
          }
          if (asJson) {
            output.print(
              JSON.stringify(
                {
                  linked: existingRepoJson.projects.map(p => ({
                    id: p.id,
                    name: p.name,
                    directory: p.directory,
                    workPath: p.workPath,
                  })),
                },
                null,
                2
              )
            );
          }
          return 0;
        }
        // No existing projects — fall through to discovery
      } else {
        // Interactive: show workspace selector
        const choices = sortedDirs.map(dir => {
          const existing = existingByDir.get(dir);
          const frameworks = detectedWorkspaces.get(dir);
          const folderName = dir.split('/').filter(Boolean).pop() ?? dir;

          let label = dir;
          if (frameworks?.length) {
            const fw = frameworks[0];
            const fwText = styledFramework(fw);
            // If project name differs from folder name, show it
            if (existing && existing.name !== folderName) {
              label = `${dir} ${fwText} ${chalk.gray(`(${existing.name})`)}`;
            } else {
              label = `${dir} ${fwText}`;
            }
          } else if (existing && existing.name !== folderName) {
            label = `${dir} ${chalk.gray(`(${existing.name})`)}`;
          }

          return {
            name: label,
            value: dir,
            checked: existingDirs.has(dir),
          };
        });

        const selectedDirs = await client.input.checkbox<string>({
          message: 'Which workspace folders should be linked?',
          choices,
          instructions: false,
        });

        // Identify newly selected directories (not already in repo.json)
        const newDirs = selectedDirs.filter(d => !existingDirs.has(d));
        // Identify removed directories (were in repo.json but now unchecked)
        const removedDirs = new Set(
          [...existingDirs].filter(
            d => d !== '.' && d !== '' && !selectedDirs.includes(d)
          )
        );

        if (newDirs.length === 0 && removedDirs.size === 0) {
          // No changes
          if (!asJson) {
            const kept =
              existingRepoJson.projects?.filter(
                p => !removedDirs.has(normalizePath(p.directory || '.'))
              ) ?? [];
            if (kept.length > 0) {
              const summaryLines = kept.map(
                p =>
                  `   ${chalk.gray('•')} ${chalk.cyan(p.name)} ${chalk.gray(
                    `(${p.workPath ?? p.directory ?? '.'})`
                  )}`
              );
              output.print(
                prependEmoji(
                  `Linked ${kept.length} project(s):`,
                  emoji('link')
                ) + '\n'
              );
              output.print(summaryLines.join('\n') + '\n');
            } else {
              output.log('No workspaces selected.');
            }
          }
          if (asJson) {
            output.print(
              JSON.stringify(
                {
                  linked: (existingRepoJson.projects ?? []).map(p => ({
                    id: p.id,
                    name: p.name,
                    directory: p.directory,
                    workPath: p.workPath,
                  })),
                },
                null,
                2
              )
            );
          }
          return 0;
        }

        // Keep existing projects that weren't unchecked
        const keptProjects: RepoProjectConfig[] = (
          existingRepoJson.projects ?? []
        ).filter(p => !removedDirs.has(normalizePath(p.directory || '.')));

        if (newDirs.length > 0) {
          // Fetch all accessible teams to search across
          let teamIds: string[] | undefined;
          const teamsMap = new Map<string, { name: string; slug: string }>();
          try {
            const body = await client.fetch<{
              teams: Array<{ id: string; name: string; slug: string }>;
            }>('/v1/teams', {
              useCurrentTeam: false,
              skipSAMLReauth: true,
            });
            const teams = body.teams ?? [];
            for (const t of teams) {
              teamsMap.set(t.id, { name: t.name, slug: t.slug });
            }
            teamIds = teams.map(t => t.id);
          } catch (err) {
            output.debug(
              `Failed to fetch teams: ${err instanceof Error ? err.message : err}`
            );
          }

          // Search for projects matching the new folder names
          const scopes: Array<string | undefined> = [
            undefined,
            ...(teamIds ?? []),
          ];

          const gitConfigPath =
            getGitConfigPath({ cwd: earlyRootPath }) ??
            join(earlyRootPath, '.git/config');
          const remoteUrls = await getRemoteUrls(gitConfigPath);
          const repoUrl =
            remoteUrls?.origin ?? (remoteUrls && Object.values(remoteUrls)[0]);
          const parsed = repoUrl ? parseRepoUrl(repoUrl) : null;
          const currentRepoOrgRepo = parsed
            ? `${parsed.org}/${parsed.repo}`
            : null;

          // Fire all folder searches in parallel, then handle results sequentially
          const dirSearchResults = await Promise.all(
            newDirs.map(async dir => {
              const folderName = dir.split('/').filter(Boolean).pop() ?? dir;
              const query = new URLSearchParams({
                search: folderName,
                limit: '20',
              });
              const endpoint = `/v9/projects?${query}`;

              const settled = await Promise.allSettled(
                scopes.map(async id => {
                  const opts = id
                    ? { accountId: id, skipSAMLReauth: true }
                    : {
                        useCurrentTeam: false as const,
                        skipSAMLReauth: true,
                      };
                  try {
                    const body = await client.fetch<{
                      projects: Project[];
                    }>(endpoint, opts);
                    return body.projects ?? [];
                  } catch {
                    return [];
                  }
                })
              );

              const seen = new Set<string>();
              const matches: Project[] = [];
              const otherRepoMatches: Project[] = [];
              for (const result of settled) {
                if (result.status !== 'fulfilled') continue;
                for (const p of result.value) {
                  if (p.name !== folderName || seen.has(p.id)) continue;
                  seen.add(p.id);
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
                  if (linkedToOtherRepo) {
                    otherRepoMatches.push(p);
                  } else {
                    matches.push(p);
                  }
                }
              }
              return { dir, folderName, matches, otherRepoMatches };
            })
          );

          for (const {
            dir,
            folderName,
            matches,
            otherRepoMatches,
          } of dirSearchResults) {
            // Combine: prefer same-repo matches, but include other-repo as fallback
            const allCandidates = [...matches, ...otherRepoMatches];

            if (matches.length === 1) {
              const p = matches[0];
              keptProjects.push({
                id: p.id,
                name: p.name,
                directory: dir,
                orgId: p.accountId,
              });
              if (!asJson) {
                output.log(
                  `Found project ${chalk.cyan(p.name)} for ${chalk.gray(dir)}`
                );
              }
            } else if (matches.length > 1) {
              const chosen = await client.input.select<Project>({
                message: `Multiple projects match ${chalk.cyan(dir)}. Which one?`,
                choices: matches.map(p => {
                  const teamInfo = teamsMap.get(p.accountId);
                  const teamLabel = teamInfo
                    ? ` ${chalk.gray(`on ${teamInfo.name} (${teamInfo.slug})`)}`
                    : '';
                  return { name: `${p.name}${teamLabel}`, value: p };
                }),
              });
              keptProjects.push({
                id: chosen.id,
                name: chosen.name,
                directory: dir,
                orgId: chosen.accountId,
              });
            } else if (allCandidates.length > 0) {
              // Projects exist but are linked to a different repo — offer to link anyway
              if (!client.stdin.isTTY && !yes) {
                output.warn(
                  `Project ${chalk.cyan(folderName)} exists but is linked to another repo. Run interactively to link.`
                );
                continue;
              }
              // Build a select with all candidates + create + skip
              const selectChoices: Array<{
                name: string;
                value:
                  | { type: 'link'; project: Project }
                  | { type: 'create' }
                  | { type: 'skip' };
              }> = allCandidates.map(p => {
                const teamInfo = teamsMap.get(p.accountId);
                const teamLabel = teamInfo
                  ? ` ${chalk.gray(`on ${teamInfo.name} (${teamInfo.slug})`)}`
                  : '';
                const displayRepo = p.link?.repo
                  ? p.link.repo.includes('/')
                    ? p.link.repo
                    : p.link.org
                      ? `${p.link.org}/${p.link.repo}`
                      : p.link.repo
                  : null;
                const repoLabel = displayRepo
                  ? ` ${chalk.gray(`(linked to ${displayRepo})`)}`
                  : '';
                return {
                  name: `Link to ${p.name}${teamLabel}${repoLabel}`,
                  value: { type: 'link' as const, project: p },
                };
              });
              if (parsed) {
                selectChoices.push({
                  name: `Create new project "${folderName}"`,
                  value: { type: 'create' as const },
                });
              }
              selectChoices.push({
                name: 'Skip',
                value: { type: 'skip' as const },
              });

              const action = yes
                ? selectChoices[0].value
                : await client.input.select({
                    message: `Found existing project(s) named ${chalk.cyan(folderName)} for ${chalk.gray(dir)}:`,
                    choices: selectChoices,
                  });

              if (action.type === 'link') {
                keptProjects.push({
                  id: action.project.id,
                  name: action.project.name,
                  directory: dir,
                  orgId: action.project.accountId,
                });
              } else if (action.type === 'create') {
                await selectOrgForNewProject(client, false);
                output.spinner(`Creating project ${folderName}…`);
                const newProject = await createProject(client, {
                  name: folderName,
                  framework:
                    detectedWorkspaces.get(dir)?.[0]?.slug ?? undefined,
                });
                output.stopSpinner();
                const connectResult = await connectGitProvider(
                  client,
                  newProject.id,
                  parsed!.provider,
                  `${parsed!.org}/${parsed!.repo}`
                );
                if (connectResult !== 1) {
                  keptProjects.push({
                    id: newProject.id,
                    name: newProject.name,
                    directory: dir,
                    orgId: newProject.accountId,
                  });
                  if (!asJson) {
                    output.log(
                      prependEmoji(
                        `Created ${chalk.bold(newProject.name)} for ${chalk.gray(dir)}`,
                        emoji('link')
                      )
                    );
                  }
                }
              }
            } else {
              // Truly no project found — offer to create
              if (!client.stdin.isTTY) {
                output.warn(
                  `No project found for ${chalk.cyan(dir)}. Run interactively to create one.`
                );
                continue;
              }
              const action = await client.input.select({
                message: `No project found for ${chalk.cyan(dir)}.`,
                choices: [
                  {
                    name: `Create new project "${folderName}"`,
                    value: 'create' as const,
                  },
                  { name: 'Skip', value: 'skip' as const },
                ],
              });
              if (action === 'create') {
                if (!parsed) {
                  output.error(
                    'Could not parse Git remote URL to connect the new project.'
                  );
                  continue;
                }
                await selectOrgForNewProject(client, false);
                output.spinner(`Creating project ${folderName}…`);
                const newProject = await createProject(client, {
                  name: folderName,
                  framework:
                    detectedWorkspaces.get(dir)?.[0]?.slug ?? undefined,
                });
                output.stopSpinner();
                const connectResult = await connectGitProvider(
                  client,
                  newProject.id,
                  parsed.provider,
                  `${parsed.org}/${parsed.repo}`
                );
                if (connectResult === 1) continue;
                keptProjects.push({
                  id: newProject.id,
                  name: newProject.name,
                  directory: dir,
                  orgId: newProject.accountId,
                });
                if (!asJson) {
                  output.log(
                    prependEmoji(
                      `Created ${chalk.bold(newProject.name)} for ${chalk.gray(dir)}`,
                      emoji('link')
                    )
                  );
                }
              }
            }
          }
        }

        // Write updated repo.json
        if (keptProjects.length > 0 || removedDirs.size > 0) {
          const updatedConfig: RepoProjectsConfig = {
            ...existingRepoJson,
            projects: keptProjects,
          };
          await ensureDir(join(earlyRootPath, VERCEL_DIR));
          await outputJSON(repoJsonPath, updatedConfig, { spaces: 2 });

          // Write project.json for new projects
          for (const p of keptProjects) {
            if (!existingByDir.has(normalizePath(p.directory || '.'))) {
              const projectRootDir =
                p.directory === '.' || !p.directory
                  ? earlyRootPath
                  : join(earlyRootPath, p.directory);
              const vercelDir = join(projectRootDir, VERCEL_DIR);
              await ensureDir(vercelDir);
              const projectJsonPath = join(vercelDir, VERCEL_DIR_PROJECT);
              let existing: Record<string, unknown> = {};
              try {
                existing = await readJSON(projectJsonPath);
              } catch (err2) {
                if (!isErrnoException(err2) || err2.code !== 'ENOENT')
                  throw err2;
              }
              await outputJSON(
                projectJsonPath,
                {
                  ...existing,
                  projectId: p.id,
                  orgId: p.orgId,
                  projectName: p.name,
                },
                { spaces: 2 }
              );
              await writeReadme(projectRootDir);
              await addToGitIgnore(projectRootDir);
            }
          }

          // Remove project.json for unchecked projects
          for (const dir of removedDirs) {
            const projectRootDir =
              dir === '.' ? earlyRootPath : join(earlyRootPath, dir);
            const projectJsonPath = join(
              projectRootDir,
              VERCEL_DIR,
              VERCEL_DIR_PROJECT
            );
            try {
              const { rmSync: rm } = await import('fs');
              rm(projectJsonPath, { force: true });
            } catch {
              // ignore
            }
          }

          if (!asJson) {
            const summaryLines = keptProjects.map(
              p =>
                `   ${chalk.gray('•')} ${chalk.cyan(p.name)} ${chalk.gray(
                  `(${p.workPath ?? p.directory ?? '.'})`
                )}`
            );
            output.print(
              prependEmoji(
                `Linked ${keptProjects.length} project(s):`,
                emoji('link')
              ) + '\n'
            );
            output.print(summaryLines.join('\n') + '\n');
            output.print(chalk.gray(`   ${VERCEL_DIR} updated`) + '\n');
          }
          if (asJson) {
            output.print(
              JSON.stringify(
                {
                  linked: keptProjects.map(p => ({
                    id: p.id,
                    name: p.name,
                    directory: p.directory,
                    workPath: p.workPath,
                  })),
                },
                null,
                2
              )
            );
          }
        } else {
          if (!asJson) output.log('No workspaces selected.');
        }
        return 0;
      }
    }
  }

  // Fetch all accessible teams to search across
  let teamIds: string[] | undefined;
  const teamsMap = new Map<string, { name: string; slug: string }>();
  try {
    const body = await client.fetch<{
      teams: Array<{ id: string; name: string; slug: string }>;
    }>('/v1/teams', {
      useCurrentTeam: false,
      skipSAMLReauth: true,
    });
    const teams = body.teams ?? [];
    for (const t of teams) {
      teamsMap.set(t.id, { name: t.name, slug: t.slug });
    }
    teamIds = teams.map(t => t.id);
  } catch (err) {
    output.debug(
      `Failed to fetch teams: ${err instanceof Error ? err.message : err}`
    );
  }

  const baseline = await collectLinkBaseline(client.cwd, {
    client,
    teamIds,
  });

  function serializeBaselineForJson(bl: LinkBaseline, linked?: unknown) {
    const out: Record<string, unknown> = {
      cwd: bl.cwd,
      rootPath: bl.rootPath ?? null,
      detectedProjects: [...bl.detectedProjects.entries()].map(([dir, fws]) => [
        dir,
        fws.map(f => f.slug),
      ]),
      repoJson: bl.repoJson,
      projectJsonFiles: bl.projectJsonFiles,
      repo:
        bl.repo?.map(p => ({
          id: p.id,
          name: p.name,
          accountId: p.accountId,
          rootDirectory: p.rootDirectory,
          link: p.link
            ? p.link.repo
              ? {
                  repo: p.link.repo,
                  org: p.link.org,
                }
              : p.link.repoId
                ? {
                    repoId: p.link.repoId,
                  }
                : null
            : null,
        })) ?? null,
      potentialProjects: bl.potentialProjects.map(p => ({
        id: p.id,
        name: p.name,
        accountId: p.accountId,
        rootDirectory: p.rootDirectory,
        link: p.link
          ? p.link.repo
            ? {
                repo: p.link.repo,
                org: p.link.org,
              }
            : p.link.repoId
              ? {
                  repoId: p.link.repoId,
                }
              : null
          : null,
      })),
    };
    if (linked !== undefined) out.linked = linked;
    return out;
  }

  if (!baseline.rootPath) {
    // No repo detected: always use directory-only link (same as vc link)
    const link = await ensureLinkLegacy('link-2', client, client.cwd, {
      autoConfirm: yes,
      forceDelete: false,
    });
    if (typeof link === 'number') return link;
    if (asJson) {
      output.print(
        JSON.stringify(serializeBaselineForJson(baseline, true), null, 2)
      );
    }
    return 0;
  }

  const rootPath = baseline.rootPath;
  const repoProjects: Project[] = baseline.repo ?? [];

  // --- State for interactive flow (see PLAN §11) ---
  const atRepoRoot =
    normalizePath(relative(rootPath, baseline.cwd)) === '.' ||
    baseline.cwd === rootPath;
  const cwdRelativePath =
    normalizePath(relative(rootPath, baseline.cwd)) || '.';
  const cwdFolderName =
    cwdRelativePath === '.'
      ? undefined
      : cwdRelativePath.split('/').filter(Boolean).slice(-1)[0];
  const projectsMatchingCwd: Project[] = repoProjects.filter(
    p =>
      normalizePath(p.rootDirectory || '.') === cwdRelativePath ||
      p.name === cwdFolderName
  );
  const rootProject = repoProjects.find(
    p => normalizePath(p.rootDirectory || '.') === '.'
  );
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
  let jsonResult: ReturnType<typeof serializeBaselineForJson> | null = null;

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
        case projectsMatchingCwd.length > 1:
          outcome = { type: 'link_many', projects: projectsMatchingCwd };
          break;
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
      const linkOneProject = outcome.project;
      // Repo root, single project — confirm like subfolder (closer behavior)
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
            `Found project ${chalk.cyan(`"${linkOneProject.name}"`)}. Link to it?`,
            true
          )));
      if (linkToIt) {
        projectsToWrite = [linkOneProject];
        shouldAskPullEnv = true;
      } else {
        const action = await client.input.select({
          message:
            'Would you like to link to an existing project or create a new one?',
          choices: [
            {
              name: 'Link to an existing project',
              value: 'existing' as const,
            },
            { name: 'Create a new project', value: 'new' as const },
          ],
        });
        if (action === 'existing') {
          const res = await client.fetch<{
            projects: Project[];
            pagination: { next: number | null };
          }>(`/v9/projects?limit=100`, {
            accountId: linkOneProject.accountId,
          });
          const allProjects = res.projects ?? [];
          const otherProjects = allProjects.filter(
            p => p.id !== linkOneProject.id
          );
          if (otherProjects.length === 0) {
            if (!asJson) output.log('No other projects in this scope.');
          } else {
            const sorted = [...otherProjects].sort(
              (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
            );
            const chosen = await client.input.select<Project>({
              message: 'Which existing project do you want to link?',
              choices: sorted.map(p => ({ name: p.name, value: p })),
            });
            const withRoot: Project = {
              ...chosen,
              rootDirectory:
                cwdRelativePath === '.' ? undefined : cwdRelativePath,
            };
            projectsToWrite = [
              ...(baseline.repo ?? []).filter(p => p.id !== chosen.id),
              withRoot,
            ];
            linkedPotentialProject = (baseline.repo ?? []).some(
              p => p.id === chosen.id
            )
              ? null
              : chosen;
            shouldAskPullEnv = true;
          }
        } else {
          const suggestedName = cwdFolderName ?? 'my-app';
          const gitConfigPath =
            getGitConfigPath({ cwd: rootPath }) ??
            join(rootPath, '.git/config');
          const remoteUrls = await getRemoteUrls(gitConfigPath);
          const repoUrl =
            remoteUrls?.origin ?? (remoteUrls && Object.values(remoteUrls)[0]);
          const parsed = repoUrl ? parseRepoUrl(repoUrl) : null;
          if (!parsed) {
            output.error(
              'Could not parse Git remote URL to connect the new project.'
            );
            return 1;
          }
          await selectOrgForNewProject(client, yes);
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
            rootDirectory:
              cwdRelativePath === '.' ? undefined : cwdRelativePath,
          };
          projectsToWrite = [...(baseline.repo ?? []), projectWithRoot];
          shouldAskPullEnv = true;
          if (!asJson) {
            output.log(
              prependEmoji(
                `Created ${chalk.bold(newProject.name)} and connected to Git`,
                emoji('link')
              )
            );
          }
        }
      }
      break;
    }
    case 'link_many': {
      // Group projects by rootDirectory to detect cross-team collisions
      const dirGroups = new Map<string, Project[]>();
      for (const p of outcome.projects) {
        const dir = normalizePath(p.rootDirectory || '.');
        const list = dirGroups.get(dir) ?? [];
        list.push(p);
        dirGroups.set(dir, list);
      }

      // Find directories with multiple projects (collisions across teams)
      const collisions = [...dirGroups.entries()].filter(
        ([, ps]) => ps.length > 1
      );

      if (collisions.length > 0 && client.stdin.isTTY && !yes) {
        const resolved: Project[] = [];
        for (const [dir, ps] of collisions) {
          const dirLabel = dir === '.' ? 'repository root' : chalk.cyan(dir);
          const chosen = await client.input.select<Project>({
            message: `Multiple projects found for ${dirLabel}. Which one should we link?`,
            choices: ps.map(p => {
              const teamInfo = teamsMap.get(p.accountId);
              const teamLabel = teamInfo
                ? ` ${chalk.gray(`on ${teamInfo.name} (${teamInfo.slug})`)}`
                : '';
              return { name: `${p.name}${teamLabel}`, value: p };
            }),
          });
          resolved.push(chosen);
        }
        // Non-colliding projects from this outcome plus the chosen ones
        const collidingIds = new Set(
          collisions.flatMap(([, ps]) => ps.map(p => p.id))
        );
        const nonColliding = outcome.projects.filter(
          p => !collidingIds.has(p.id)
        );
        // Also include repo projects that weren't in the outcome set at all
        const outcomeIds = new Set(outcome.projects.map(p => p.id));
        const otherRepoProjects = repoProjects.filter(
          p => !outcomeIds.has(p.id)
        );
        projectsToWrite = [...nonColliding, ...resolved, ...otherRepoProjects];
        shouldAskPullEnv = true;
      } else {
        projectsToWrite = outcome.projects;
        shouldAskPullEnv = true;
      }
      break;
    }
    case 'prompt_link_existing': {
      const promptProject = outcome.project;
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
            `Link to ${chalk.cyan(promptProject.name)}?`,
            true
          )));
      if (linkToIt) {
        projectsToWrite = [promptProject];
        shouldAskPullEnv = true;
      } else {
        const action = await client.input.select({
          message:
            'Would you like to link to an existing project or create a new one?',
          choices: [
            { name: 'Link to an existing project', value: 'existing' as const },
            { name: 'Create a new project', value: 'new' as const },
          ],
        });
        if (action === 'existing') {
          const res = await client.fetch<{
            projects: Project[];
            pagination: { next: number | null };
          }>(`/v9/projects?limit=100`, {
            accountId: promptProject.accountId,
          });
          const allProjects = res.projects ?? [];
          const otherProjects = allProjects.filter(
            p => p.id !== promptProject.id
          );
          if (otherProjects.length === 0) {
            if (!asJson) output.log('No other projects in this scope.');
          } else {
            const sorted = [...otherProjects].sort(
              (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
            );
            const chosen = await client.input.select<Project>({
              message: 'Which existing project do you want to link?',
              choices: sorted.map(p => ({ name: p.name, value: p })),
            });
            const withRoot: Project = {
              ...chosen,
              rootDirectory:
                cwdRelativePath === '.' ? undefined : cwdRelativePath,
            };
            projectsToWrite = [
              ...(baseline.repo ?? []).filter(p => p.id !== chosen.id),
              withRoot,
            ];
            linkedPotentialProject = (baseline.repo ?? []).some(
              p => p.id === chosen.id
            )
              ? null
              : chosen;
            shouldAskPullEnv = true;
          }
        } else {
          // Create new — same flow as offer_create
          const suggestedName = cwdFolderName ?? 'my-app';
          const gitConfigPath =
            getGitConfigPath({ cwd: rootPath }) ??
            join(rootPath, '.git/config');
          const remoteUrls = await getRemoteUrls(gitConfigPath);
          const repoUrl =
            remoteUrls?.origin ?? (remoteUrls && Object.values(remoteUrls)[0]);
          const parsed = repoUrl ? parseRepoUrl(repoUrl) : null;
          if (!parsed) {
            output.error(
              'Could not parse Git remote URL to connect the new project.'
            );
            return 1;
          }
          await selectOrgForNewProject(client, yes);
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
            rootDirectory:
              cwdRelativePath === '.' ? undefined : cwdRelativePath,
          };
          projectsToWrite = [...(baseline.repo ?? []), projectWithRoot];
          shouldAskPullEnv = true;
          if (!asJson) {
            output.log(
              prependEmoji(
                `Created ${chalk.bold(newProject.name)} and connected to Git`,
                emoji('link')
              )
            );
          }
        }
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
          rootDirectory: cwdRelativePath === '.' ? undefined : cwdRelativePath,
        };
        projectsToWrite = [...(baseline.repo ?? []), withRoot];
        linkedPotentialProject = outcome.project;
        shouldAskPullEnv = true;
      }
      break;
    }
    case 'offer_create': {
      if (yes || !client.stdin.isTTY) {
        output.error(
          'Project creation requires interactive mode. Run without --yes or run in a TTY.'
        );
        return 1;
      }
      const frameworkName = frameworkAtCwd?.[0]?.name ?? 'project';
      const suggestedName = cwdFolderName ?? 'my-app';
      const createIt = await client.input.confirm(
        `Create new project ${chalk.cyan(suggestedName)} with ${chalk.cyan(frameworkName)}?`,
        true
      );
      if (createIt) {
        const gitConfigPath =
          getGitConfigPath({ cwd: rootPath }) ?? join(rootPath, '.git/config');
        const remoteUrls = await getRemoteUrls(gitConfigPath);
        const repoUrl =
          remoteUrls?.origin ?? (remoteUrls && Object.values(remoteUrls)[0]);
        const parsed = repoUrl ? parseRepoUrl(repoUrl) : null;
        if (!parsed) {
          output.error(
            'Could not parse Git remote URL to connect the new project.'
          );
          return 1;
        }
        await selectOrgForNewProject(client, yes);
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
        if (!asJson) {
          output.log(
            prependEmoji(
              `Created ${chalk.bold(newProject.name)} and connected to Git`,
              emoji('link')
            )
          );
        }
      }
      break;
    }
    case 'skip':
      jsonResult = serializeBaselineForJson(baseline, []);
      if (!asJson) output.log('No project to link.');
      break;
  }

  // Subtle notice: repo-linked projects that have no matching folder locally
  if ((baseline.repo?.length ?? 0) > 0 && rootPath && !asJson) {
    const noFolder: Project[] = [];
    for (const p of baseline.repo ?? []) {
      const dir = join(rootPath, p.rootDirectory || '.');
      if (!(await pathExists(dir))) noFolder.push(p);
    }
    if (noFolder.length > 0) {
      output.log(
        chalk.gray(
          'Note: The following projects are linked to this repo but no matching folder was found: ' +
            noFolder.map(p => p.name).join(', ') +
            '.'
        )
      );
    }
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
      remoteUrls?.origin ??
      (remoteUrls && Object.keys(remoteUrls)[0]) ??
      'origin';
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
    jsonResult = serializeBaselineForJson(baseline, writtenProjects);

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
          output.error(
            'Could not parse Git remote URL to connect the project.'
          );
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
        if (!asJson) {
          output.print(
            prependEmoji(
              `Linked to ${chalk.cyan(linkedPotentialProject.name)}`,
              emoji('link')
            ) + '\n'
          );
          output.print(chalk.gray(`   ${VERCEL_DIR} updated`) + '\n');
        }
      } else {
        // They declined "Connect this repo?" — offer link to another existing or create new
        if (yes || !client.stdin.isTTY) {
          output.error(
            'Project creation requires interactive mode. Run without --yes or run in a TTY.'
          );
          return 1;
        }
        const action = await client.input.select({
          message:
            'Would you like to link to an existing project or create a new one?',
          choices: [
            { name: 'Link to an existing project', value: 'existing' as const },
            { name: 'Create a new project', value: 'new' as const },
          ],
        });
        if (action === 'existing') {
          const res = await client.fetch<{
            projects: Project[];
            pagination: { next: number | null };
          }>(`/v9/projects?limit=100`, {
            accountId: linkedPotentialProject!.accountId,
          });
          const allProjects = res.projects ?? [];
          const otherProjects = allProjects.filter(
            p => p.id !== linkedPotentialProject!.id
          );
          if (otherProjects.length === 0) {
            if (!asJson) output.log('No other projects in this scope.');
          } else {
            const sorted = [...otherProjects].sort(
              (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
            );
            const chosen = await client.input.select<Project>({
              message: 'Which existing project do you want to link?',
              choices: sorted.map(p => ({ name: p.name, value: p })),
            });
            const withRoot: Project = {
              ...chosen,
              rootDirectory:
                cwdRelativePath === '.' ? undefined : cwdRelativePath,
            };
            projectsToWrite = [
              ...(baseline.repo ?? []).filter(p => p.id !== chosen.id),
              withRoot,
            ];
            const writtenForChosen = await writeRepoAndProjectFiles(
              rootPath,
              projectsToWrite,
              baseline.projectJsonFiles,
              baseline.detectedProjects
            );
            jsonResult = serializeBaselineForJson(baseline, writtenForChosen);
            if (!asJson) {
              output.print(
                prependEmoji(
                  `Linked to ${chalk.cyan(chosen.name)}`,
                  emoji('link')
                ) + '\n'
              );
              output.print(chalk.gray(`   ${VERCEL_DIR} updated`) + '\n');
            }
          }
        } else {
          const newName = await client.input.text({
            message: 'New project name:',
            default: cwdFolderName ?? 'my-app',
          });
          const gitConfigPathNew =
            getGitConfigPath({ cwd: rootPath }) ??
            join(rootPath, '.git/config');
          const remoteUrlsForNew = await getRemoteUrls(gitConfigPathNew);
          const repoUrlForNew =
            remoteUrlsForNew?.origin ??
            (remoteUrlsForNew && Object.values(remoteUrlsForNew)[0]);
          const parsedNew = repoUrlForNew ? parseRepoUrl(repoUrlForNew) : null;
          if (!parsedNew) {
            output.error('Could not parse Git remote URL.');
            return 1;
          }
          await selectOrgForNewProject(client, yes);
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
          const writtenForNew = await writeRepoAndProjectFiles(
            rootPath,
            projectsToWrite,
            baseline.projectJsonFiles,
            baseline.detectedProjects
          );
          jsonResult = serializeBaselineForJson(baseline, writtenForNew);
          if (!asJson) {
            output.print(
              prependEmoji(
                `Created and linked ${chalk.cyan(newProject.name)}`,
                emoji('link')
              ) + '\n'
            );
            output.print(chalk.gray(`   ${VERCEL_DIR} updated`) + '\n');
          }
        }
      }
    } else {
      // When in a project subfolder, only mention that project; at repo root show full list
      const linkedProjectForCwd =
        !atRepoRoot &&
        projectsToWrite.find(
          p => normalizePath(p.rootDirectory || '.') === cwdRelativePath
        );

      if (linkedProjectForCwd) {
        if (!asJson) {
          output.print(
            prependEmoji(
              `Linked to ${chalk.cyan(linkedProjectForCwd.name)}`,
              emoji('link')
            ) + '\n'
          );
          output.print(chalk.gray(`   ${VERCEL_DIR} updated`) + '\n');
        }
      } else {
        if (!asJson) {
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
          output.print(chalk.gray(`   ${VERCEL_DIR} updated`) + '\n');
        }
      }
    }

    if (shouldAskPullEnv && !skipPull && client.stdin.isTTY) {
      const pullEnvConfirmed =
        yes ||
        (await client.input.confirm(
          'Would you like to pull environment variables now?',
          false
        ));
      if (pullEnvConfirmed && writtenProjects.length > 0) {
        let pullTargets: WrittenRepoProject[];
        if (yes || writtenProjects.length === 1) {
          pullTargets = writtenProjects;
        } else {
          pullTargets = await client.input.checkbox<WrittenRepoProject>({
            message:
              'Which projects should environment variables be pulled for?',
            choices: writtenProjects.map(p => {
              const pathLabel = (p.workPath ?? p.directory) || '.';
              return {
                name: `${p.name} ${chalk.gray(`(${pathLabel})`)}`,
                value: p,
                checked: true,
              };
            }),
          });
        }
        if (pullTargets.length > 0) {
          const originalCwd = client.cwd;
          const pullArgv = yes ? ['--yes'] : [];
          try {
            for (const target of pullTargets) {
              const rel = normalizePath(
                (target.workPath ?? target.directory) || '.'
              );
              const projectDir =
                rel === '.' || rel === '' ? rootPath : join(rootPath, rel);
              client.cwd = projectDir;
              const exitCode = await pull(client, pullArgv, 'vercel-cli:link');
              if (exitCode !== 0) {
                output.error(
                  `Failed to pull environment variables for ${chalk.bold(
                    target.name
                  )}. Run ${chalk.bold('vercel env pull')} from that project directory, or try again.`
                );
              }
            }
          } finally {
            client.cwd = originalCwd;
          }
        }
      }
    }
  } else if (
    outcome.type === 'skip' &&
    baseline.repo !== null &&
    baseline.repo.length === 0
  ) {
    if (!jsonResult) jsonResult = serializeBaselineForJson(baseline, []);
    if (!asJson) output.log('No projects linked to this repo.');
  } else if (outcome.type === 'skip' && baseline.repo === null) {
    if (!jsonResult) jsonResult = serializeBaselineForJson(baseline, []);
    if (!asJson) {
      const detectedCount = baseline.detectedProjects.size;
      const repoProjectCount = baseline.repoJson?.projects?.length ?? 0;
      const projectJsonCount = baseline.projectJsonFiles.length;
      output.log(
        `link-2: root: ${baseline.rootPath}; detected: ${detectedCount} project(s); repo.json: ${repoProjectCount} project(s); project.json files: ${projectJsonCount} (no API repo data)`
      );
    }
  }

  if (asJson) {
    const result = jsonResult ?? serializeBaselineForJson(baseline, []);
    output.print(JSON.stringify(result, null, 2));
  }
  return 0;
}
