import chalk from 'chalk';
import { logArchivedFlagNotice } from '../../util/flags/archived-flag-notice';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { getFlag, getFlagSettings } from '../../util/flags/get-flags';
import { resolveFlagEnvironment } from '../../util/flags/environment-variant';
import { quoteArg } from '../../util/flags/quote-arg';
import { formatVariantForDisplay } from '../../util/flags/resolve-variant';
import { resolveProjectContext } from '../../util/projects/resolve-project-context';
import output from '../../output-manager';
import type {
  Flag,
  FlagEnvironmentConfig,
  FlagSettings,
} from '../../util/flags/types';

interface ResolveRulesContextOptions {
  projectName?: string;
  flagArg: string;
  environment?: string;
  promptMessage: string;
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
  const link = await resolveProjectContext({
    client,
    projectNameOrId: options.projectName,
  });
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

export function warnIfRuleChangesAreBypassed(
  flag: Flag,
  environment: string,
  changeLabel = 'rule'
): void {
  if (flag.state === 'archived') {
    logArchivedFlagNotice(flag);
    return;
  }

  const envConfig = flag.environments[environment];
  if (!envConfig) {
    return;
  }

  const mode = describeInactiveTargetingMode(flag, envConfig);
  if (!mode) {
    return;
  }

  output.print(
    `${chalk.yellow('!')} This ${changeLabel} update was saved, but ${chalk.bold(environment)} ${mode}. ${capitalize(changeLabel)} changes will not affect flag evaluation until targeting is active again.\n`
  );
  output.print(`  Enable targeting (keeps the current fallthrough):\n`);
  output.print(
    `  ${getCommandName(`flags targeting enable ${quoteArg(flag.slug)} --environment ${environment}`)}\n`
  );
}

/**
 * Describes why targeting config is not evaluated right now, or undefined when
 * it is. Reuse wins over paused, matching SDK evaluation order.
 */
export function describeInactiveTargetingMode(
  flag: Flag,
  envConfig: FlagEnvironmentConfig
): string | undefined {
  if (envConfig.reuse?.active) {
    return `reuses ${chalk.bold(envConfig.reuse.environment)}`;
  }

  if (envConfig.active) {
    return undefined;
  }

  const variantId = envConfig.pausedOutcome?.variantId;
  const variant = flag.variants.find(candidate => candidate.id === variantId);
  const serving = variant
    ? formatVariantForDisplay(variant)
    : variantId
      ? chalk.bold(variantId)
      : 'a fixed variant';
  return `is serving ${serving}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
