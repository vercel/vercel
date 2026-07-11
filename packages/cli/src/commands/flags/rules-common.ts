import chalk from 'chalk';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { getFlag, getFlagSettings } from '../../util/flags/get-flags';
import { resolveFlagEnvironment } from '../../util/flags/environment-variant';
import { getLinkedProject } from '../../util/projects/link';
import output from '../../output-manager';
import type {
  Flag,
  FlagEnvironmentConfig,
  FlagSettings,
} from '../../util/flags/types';

interface ResolveRulesContextOptions {
  flagArg: string;
  environment?: string;
  promptMessage: string;
  requireActiveFlag?: boolean;
  fetchSettings?: boolean;
}

export interface RulesCommandContext {
  projectId: string;
  flag: Flag;
  settings?: FlagSettings;
  environment: string;
  envConfig: FlagEnvironmentConfig;
}

export async function resolveRulesCommandContext(
  client: Client,
  options: ResolveRulesContextOptions
): Promise<RulesCommandContext | { exitCode: number }> {
  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return { exitCode: link.exitCode };
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return { exitCode: 1 };
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  output.spinner('Fetching flag...');
  const [flag, settings] = await Promise.all([
    getFlag(client, project.id, options.flagArg),
    options.fetchSettings
      ? getFlagSettings(client, project.id)
      : Promise.resolve(undefined),
  ]);
  output.stopSpinner();

  if (options.requireActiveFlag && flag.state === 'archived') {
    output.error(
      `Flag ${chalk.bold(flag.slug)} is archived and cannot be updated`
    );
    return { exitCode: 1 };
  }

  const environment = await resolveFlagEnvironment(
    client,
    flag,
    options.environment,
    options.promptMessage,
    {
      showEnvironmentDetails: true,
      decorateChoices: false,
    }
  );

  return {
    projectId: project.id,
    flag,
    settings,
    environment,
    envConfig: flag.environments[environment],
  };
}

export function isExitCodeResult(
  result: RulesCommandContext | { exitCode: number }
): result is { exitCode: number } {
  return 'exitCode' in result;
}
