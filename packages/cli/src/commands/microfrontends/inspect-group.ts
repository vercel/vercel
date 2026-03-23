import output from '../../output-manager';
import type Client from '../../util/client';
import { inspectGroupSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import getScope from '../../util/get-scope';
import { fetchMicrofrontendsGroups } from './utils';
import getProjectByIdOrName from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';
import type { Project } from '@vercel-internals/types';
import type {
  MicrofrontendsGroupResponse,
  MicrofrontendsProject,
} from './types';
import { existsSync } from 'fs';
import { join } from 'path';
import { getLinkedProject } from '../../util/projects/link';
import readJSONFile from '../../util/read-json-file';
import { outputActionRequired } from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';

interface InspectGroupProject {
  id: string;
  name: string;
  isDefaultApp: boolean;
  enabled: boolean;
  defaultRoute: string | null;
  productionDomain: string | null;
  framework: string | null;
  git: {
    org: string | null;
    repo: string | null;
    rootDirectory: string | null;
  };
  packageName: string | null;
  inGroupConfig: boolean;
  projectFetchStatus: 'ok' | 'not_found' | 'error';
}

interface InspectGroupJson {
  group: {
    id: string;
    slug: string;
    name: string;
    fallbackEnvironment: string | null;
  };
  projectCount: number;
  defaultApp: string | null;
  configFile: string | null;
  config: {
    exists: boolean;
    applications: string[];
  };
  projects: InspectGroupProject[];
}

interface LocalRepoContext {
  repoRoot: string | null;
  linkedProjectId: string | null;
  linkedRepoOrg: string | null;
  linkedRepoName: string | null;
}

export default async function inspectGroup(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    inspectGroupSubcommand.options
  );
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(
      'error' in formatResult ? formatResult.error : 'Invalid output format'
    );
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const groupFlag = parsedArgs.flags['--group'] as string | undefined;
  const configFileNameFlag = parsedArgs.flags['--config-file-name'] as
    | string
    | undefined;
  const { team } = await getScope(client);

  if (!team) {
    output.error('Microfrontends are only available for teams.');
    return 1;
  }

  const groupsResponse = await fetchMicrofrontendsGroups(client, team.id);
  const { groups } = groupsResponse;

  if (groups.length === 0) {
    output.error('No microfrontends groups exist.');
    return 1;
  }

  if (!groupFlag && client.nonInteractive) {
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        action: AGENT_ACTION.MISSING_ARGUMENTS,
        message:
          'Missing required flag --group. Use --group and --format=json in non-interactive mode.',
        next: [
          {
            command:
              'vercel microfrontends inspect-group --group="<group-name-or-id>" --format=json',
            when: 'to inspect a specific microfrontends group non-interactively',
          },
        ],
      },
      1
    );
    return 1;
  }

  if (!client.stdin.isTTY && !groupFlag) {
    output.error(
      'Missing required flag --group. Use --group to specify the microfrontends group, or run interactively.'
    );
    return 1;
  }

  let selectedGroup: MicrofrontendsGroupResponse;
  if (groupFlag) {
    const found = groups.find(
      g =>
        g.group.name === groupFlag ||
        g.group.id === groupFlag ||
        g.group.slug === groupFlag
    );
    if (!found) {
      output.error(`Microfrontends group "${groupFlag}" not found.`);
      return 1;
    }
    selectedGroup = found;
  } else {
    const groupId = await client.input.select({
      message: 'Select a microfrontends group to inspect:',
      choices: groups.map(g => ({ name: g.group.name, value: g.group.id })),
    });
    selectedGroup = groups.find(g => g.group.id === groupId)!;
  }

  const localRepoContext = await getLocalRepoContext(client);

  output.spinner('Fetching project metadata…');
  const projects = await Promise.all(
    selectedGroup.projects.map(project =>
      enrichGroupProject(
        client,
        team.id,
        selectedGroup,
        project,
        localRepoContext
      )
    )
  );
  output.stopSpinner();

  const defaultProject = projects.find(p => p.isDefaultApp);
  const configuredConfigFileName =
    resolveConfiguredMicrofrontendsConfigFileName(configFileNameFlag);
  if (configFileNameFlag && !configuredConfigFileName) {
    output.error(
      'Invalid --config-file-name. Value must end with .json or .jsonc.'
    );
    return 1;
  }
  const configFile = resolveLocalConfigFilePath(
    projects,
    localRepoContext,
    configuredConfigFileName
  );
  const json: InspectGroupJson = {
    group: {
      id: selectedGroup.group.id,
      slug: selectedGroup.group.slug,
      name: selectedGroup.group.name,
      fallbackEnvironment: selectedGroup.group.fallbackEnvironment ?? null,
    },
    projectCount: projects.length,
    defaultApp: defaultProject?.name ?? defaultProject?.id ?? null,
    configFile,
    config: {
      exists: !!selectedGroup.config,
      applications: Object.keys(selectedGroup.config?.applications ?? {}),
    },
    projects,
  };

  if (asJson) {
    client.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
    return 0;
  }

  output.log(`Group: ${selectedGroup.group.name}`);
  output.log(`  ID: ${selectedGroup.group.id}`);
  output.log(`  Slug: ${selectedGroup.group.slug}`);
  output.log(`  Projects: ${projects.length}`);
  output.log(
    `  Fallback environment: ${json.group.fallbackEnvironment ?? '(none)'}`
  );
  output.log(`  Local config file: ${json.configFile ?? '(not found)'}`);
  output.log(
    `  Config applications: ${json.config.applications.length > 0 ? json.config.applications.join(', ') : '(none)'}`
  );
  output.log('');
  output.log('Projects:');
  for (const project of projects) {
    output.log(
      `  - ${project.name} (${project.id})${project.isDefaultApp ? ' [default app]' : ''}`
    );
    output.log(
      `    enabled=${project.enabled} defaultRoute=${project.defaultRoute ?? '(none)'} inConfig=${project.inGroupConfig}`
    );
    output.log(
      `    productionDomain=${project.productionDomain ?? '(none)'} framework=${project.framework ?? '(unknown)'}`
    );
    output.log(
      `    rootDirectory=${project.git.rootDirectory ?? '(unknown)'} git=${project.git.org ?? '(unknown)'}/${project.git.repo ?? '(unknown)'} packageName=${project.packageName ?? '(unknown)'}`
    );
    if (project.projectFetchStatus !== 'ok') {
      output.warn(
        `Project metadata for "${project.id}" is incomplete (status: ${project.projectFetchStatus}).`
      );
    }
  }

  return 0;
}

async function enrichGroupProject(
  client: Client,
  teamId: string,
  group: MicrofrontendsGroupResponse,
  groupProject: MicrofrontendsProject,
  localRepoContext: LocalRepoContext
): Promise<InspectGroupProject> {
  let fullProject: Project | undefined;
  let projectFetchStatus: InspectGroupProject['projectFetchStatus'] = 'ok';

  try {
    const maybeProject = await getProjectByIdOrName(
      client,
      groupProject.id,
      teamId
    );
    if (maybeProject instanceof ProjectNotFound) {
      projectFetchStatus = 'not_found';
    } else {
      fullProject = maybeProject;
    }
  } catch {
    projectFetchStatus = 'error';
  }

  const name = groupProject.name ?? fullProject?.name ?? groupProject.id;
  const inGroupConfig = Object.prototype.hasOwnProperty.call(
    group.config?.applications ?? {},
    name
  );
  const rootDirectory = fullProject?.rootDirectory ?? null;
  const gitRepo = fullProject?.link?.repo ?? null;
  const gitOrg = fullProject?.link?.org ?? null;
  const productionDomain =
    fullProject?.targets?.production?.alias?.[0] ??
    fullProject?.targets?.production?.url ??
    null;
  const framework = fullProject?.framework ?? null;
  const packageName = await resolvePackageNameFromLocalRepo(
    localRepoContext,
    gitOrg,
    gitRepo,
    rootDirectory
  );

  return {
    id: groupProject.id,
    name,
    isDefaultApp: !!groupProject.microfrontends?.isDefaultApp,
    enabled: !!groupProject.microfrontends?.enabled,
    defaultRoute: groupProject.microfrontends?.defaultRoute ?? null,
    productionDomain,
    framework,
    git: {
      org: gitOrg,
      repo: gitRepo,
      rootDirectory,
    },
    packageName,
    inGroupConfig,
    projectFetchStatus,
  };
}

async function getLocalRepoContext(client: Client): Promise<LocalRepoContext> {
  try {
    const link = await getLinkedProject(client, client.cwd);
    // link is discriminated union, need to make TS happy
    if (link.status !== 'linked') {
      return {
        repoRoot: null,
        linkedProjectId: null,
        linkedRepoOrg: null,
        linkedRepoName: null,
      };
    }

    return {
      repoRoot: link.repoRoot ?? null,
      linkedProjectId: link.project.id,
      linkedRepoOrg: link.project.link?.org ?? null,
      linkedRepoName: link.project.link?.repo ?? null,
    };
  } catch {
    return {
      repoRoot: null,
      linkedProjectId: null,
      linkedRepoOrg: null,
      linkedRepoName: null,
    };
  }
}

function isProjectInLocalRepo(
  localRepoContext: LocalRepoContext,
  gitOrg: string | null,
  gitRepo: string | null
): boolean {
  if (!localRepoContext.repoRoot) {
    return false;
  }
  if (!localRepoContext.linkedRepoOrg || !localRepoContext.linkedRepoName) {
    return false;
  }
  return (
    localRepoContext.linkedRepoOrg === gitOrg &&
    localRepoContext.linkedRepoName === gitRepo
  );
}

async function resolvePackageNameFromLocalRepo(
  localRepoContext: LocalRepoContext,
  gitOrg: string | null,
  gitRepo: string | null,
  rootDirectory: string | null
): Promise<string | null> {
  if (!isProjectInLocalRepo(localRepoContext, gitOrg, gitRepo)) {
    return null;
  }

  const projectDir = join(localRepoContext.repoRoot!, rootDirectory || '');
  const packageJsonPath = join(projectDir, 'package.json');
  const pkg = await readJSONFile<{ name?: unknown }>(packageJsonPath);
  if (!pkg || pkg instanceof Error) {
    return null;
  }
  return typeof pkg.name === 'string' ? pkg.name : null;
}

function resolveLocalConfigFilePath(
  projects: InspectGroupProject[],
  localRepoContext: LocalRepoContext,
  configuredConfigFileName?: string | null
): string | null {
  const defaultProject = projects.find(project => project.isDefaultApp);
  if (!defaultProject) {
    return null;
  }
  if (
    !isProjectInLocalRepo(
      localRepoContext,
      defaultProject.git.org,
      defaultProject.git.repo
    )
  ) {
    return null;
  }

  const projectDir = join(
    localRepoContext.repoRoot!,
    defaultProject.git.rootDirectory || ''
  );
  const configuredName = configuredConfigFileName ?? null;
  if (configuredName) {
    const configuredPath = join(projectDir, configuredName);
    if (existsSync(configuredPath)) {
      return configuredPath;
    }
  }
  const jsonPath = join(projectDir, 'microfrontends.json');
  const jsoncPath = join(projectDir, 'microfrontends.jsonc');
  if (existsSync(jsonPath)) {
    return jsonPath;
  }
  if (existsSync(jsoncPath)) {
    return jsoncPath;
  }
  return null;
}

function resolveConfiguredMicrofrontendsConfigFileName(
  configured?: string | null
): string | null {
  if (!configured) {
    return null;
  }

  const normalized = configured.trim();
  if (!normalized.endsWith('.json') && !normalized.endsWith('.jsonc')) {
    return null;
  }

  // Treat leading slash as app-root relative.
  return normalized.replace(/^\/+/, '');
}
