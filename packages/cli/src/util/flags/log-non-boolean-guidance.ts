import chalk from 'chalk';
import output from '../../output-manager';
import { getCommandName } from '../pkg-name';
import { getFlagDashboardUrl } from './dashboard-url';
import { formatVariantForDisplay } from './resolve-variant';
import type { Flag } from './types';

interface LogNonBooleanFlagGuidanceOptions {
  attemptedSubcommand: 'enable' | 'disable';
  environment?: string;
  isInteractive: boolean;
  teamSlug: string;
  projectName: string;
}

export function logNonBooleanFlagGuidance(
  flag: Flag,
  {
    attemptedSubcommand,
    environment,
    isInteractive,
    teamSlug,
    projectName,
  }: LogNonBooleanFlagGuidanceOptions
): void {
  const dashboardUrl = getFlagDashboardUrl(teamSlug, projectName, flag.slug);
  const suggestedEnvironment =
    environment && environment in flag.environments ? environment : undefined;

  output.warn(
    `The ${getCommandName(`flags ${attemptedSubcommand}`)} command only works with boolean flags.`
  );
  output.log(
    `Flag ${chalk.bold(flag.slug)} is a ${chalk.cyan(flag.kind)} flag. Set a specific variant instead:`
  );
  output.log(
    `  ${getCommandName(
      getSuggestedSetCommand(flag.slug, suggestedEnvironment, isInteractive)
    )}`
  );

  if (flag.variants.length > 0) {
    output.log('Available variants:');
    for (const variant of flag.variants) {
      output.log(`  - ${formatVariantForDisplay(variant)}`);
    }
  }

  output.log(
    `See full flag details with ${getCommandName(`flags inspect ${flag.slug}`)}`
  );
  output.log(`Open in the dashboard: ${chalk.cyan(dashboardUrl)}`);
}

function getSuggestedSetCommand(
  slug: string,
  environment: string | undefined,
  isInteractive: boolean
): string {
  const parts = [`flags set ${slug}`];

  if (environment) {
    parts.push(`--environment ${environment}`);
  } else if (!isInteractive) {
    parts.push('--environment <ENV>');
  }

  if (!isInteractive) {
    parts.push('--variant <VARIANT>');
  }

  return parts.join(' ');
}
