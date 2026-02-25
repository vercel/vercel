import chalk from 'chalk';
import type Client from '../client';
import indent from '../output/indent';
import output from '../../output-manager';
import { getLinkedProject } from '../projects/link';
import { connectResourceToProject } from '../integration-resource/connect-resource-to-project';
import pull from '../../commands/env/pull';

export const VALID_ENVIRONMENTS = [
  'production',
  'preview',
  'development',
] as const;

export const ENV_PULL_FAILED_MESSAGE =
  'Failed to pull environment variables. You can run `vercel env pull` manually.';

export interface PostProvisionOptions {
  noConnect?: boolean;
  noEnvPull?: boolean;
  environments?: string[];
  onProjectConnected?: (projectId: string) => void;
  onProjectConnectFailed?: (projectId: string, error: Error) => void;
  prefix?: string;
}

/**
 * Validates the provided environment values against the allowed set.
 * Returns `{ valid: true }` if all values are valid, or `{ valid: false, invalid: string[] }` with the invalid values.
 */
export function validateEnvironments(
  environments: string[]
): { valid: true } | { valid: false; invalid: string[] } {
  const invalid = environments.filter(
    env =>
      !VALID_ENVIRONMENTS.includes(env as (typeof VALID_ENVIRONMENTS)[number])
  );
  if (invalid.length > 0) {
    return { valid: false, invalid };
  }
  return { valid: true };
}

export interface PostProvisionSetupResult {
  exitCode: number;
  dashboardUrl: string;
  project?: { id: string; name: string };
  connected: boolean;
  environments: string[];
  envPulled: boolean;
  connectError?: string;
}

/**
 * Handles post-provisioning setup: prints dashboard URL, auto-connects
 * resource to the linked project (all environments), and runs env pull.
 *
 * Respects `--no-connect` (skip linking), `--no-env-pull` (skip env pull),
 * and `--environment` (connect to specific environments only).
 */
export async function postProvisionSetup(
  client: Client,
  resourceName: string,
  resourceId: string,
  contextName: string,
  options: PostProvisionOptions = {}
): Promise<PostProvisionSetupResult> {
  const dashboardUrl = `https://vercel.com/${contextName}/~/stores/integration/${resourceId}`;
  output.log(
    indent(`Dashboard: ${output.link(dashboardUrl, dashboardUrl)}`, 4)
  );

  const baseResult: PostProvisionSetupResult = {
    exitCode: 0,
    dashboardUrl,
    connected: false,
    environments: [],
    envPulled: false,
  };

  if (options.noConnect) {
    return baseResult;
  }

  const linkedProject = await getLinkedProject(client);
  if (linkedProject.status === 'error') {
    return { ...baseResult, exitCode: linkedProject.exitCode };
  }
  if (linkedProject.status === 'not_linked') {
    return baseResult;
  }

  const { project } = linkedProject;
  const environments = [
    ...new Set(
      options.environments && options.environments.length > 0
        ? options.environments
        : [...VALID_ENVIRONMENTS]
    ),
  ];
  output.debug(`Selected environments: ${JSON.stringify(environments)}`);

  output.spinner(
    `Connecting ${chalk.bold(resourceName)} to ${chalk.bold(project.name)}...`
  );
  output.debug(`Connecting resource ${resourceId} to project ${project.id}`);
  try {
    await connectResourceToProject(
      client,
      project.id,
      resourceId,
      environments,
      options.prefix ? { envVarPrefix: options.prefix } : undefined
    );
  } catch (error) {
    output.stopSpinner();
    options.onProjectConnectFailed?.(project.id, error as Error);
    output.error(`Failed to connect: ${(error as Error).message}`);
    return {
      ...baseResult,
      exitCode: 1,
      project: { id: project.id, name: project.name },
      environments,
      connectError: (error as Error).message,
    };
  }
  output.stopSpinner();

  output.log(
    `${chalk.bold(resourceName)} successfully connected to ${chalk.bold(project.name)}`
  );

  options.onProjectConnected?.(project.id);

  let envPulled = false;
  if (!options.noEnvPull) {
    const pullExitCode = await pull(
      client,
      ['--yes'],
      'vercel-cli:integration:add'
    );
    if (pullExitCode !== 0) {
      output.warn(ENV_PULL_FAILED_MESSAGE);
    } else {
      envPulled = true;
    }
  }

  return {
    ...baseResult,
    project: { id: project.id, name: project.name },
    connected: true,
    environments,
    envPulled,
  };
}

/**
 * Auto-detect the linked project name without prompting.
 * Returns the project name/id or undefined if not linked or --no-connect.
 */
export async function getLinkedProjectField(
  client: Client,
  noConnect: boolean | undefined,
  field: 'name' | 'id' = 'name'
): Promise<{ value: string | undefined; exitCode?: number }> {
  if (noConnect) {
    return { value: undefined };
  }

  const linkedProject = await getLinkedProject(client);
  if (linkedProject.status === 'error') {
    return { value: undefined, exitCode: linkedProject.exitCode };
  }
  if (linkedProject.status === 'linked') {
    return { value: linkedProject.project[field] };
  }
  return { value: undefined };
}
