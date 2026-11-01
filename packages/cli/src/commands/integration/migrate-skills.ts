import chalk from 'chalk';
import execa from 'execa';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { migrateSkillsSubcommand } from './command';
import { IntegrationMigrateSkillsTelemetryClient } from '../../util/telemetry/commands/integration/migrate-skills';
import {
  buildMigrateArgs,
  buildRemoveArgs,
  isEmptyPlan,
  migrateCommand,
  planNeonSkillMigration,
  readSkillsLock,
  removeCommand,
} from '../../util/integration/skill-migration';

export async function migrateSkills(
  client: Client,
  subArgs: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(
    migrateSkillsSubcommand.options
  );

  let parsedArguments;
  try {
    parsedArguments = parseArguments(subArgs, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new IntegrationMigrateSkillsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const yes = Boolean(parsedArguments.flags['--yes']);
  telemetry.trackCliFlagYes(yes);

  const plan = planNeonSkillMigration(readSkillsLock(client.cwd));

  if (isEmptyPlan(plan)) {
    output.log(
      'No Vercel-installed Neon marketplace skills were found in this project.'
    );
    return 0;
  }

  // Disclosure: say exactly what was found and what will change, before acting.
  output.log(
    'The Vercel Marketplace installed Neon agent skills in this project during integration setup. This command will:'
  );
  for (const skill of plan.migrate) {
    output.log(
      `  • Update ${chalk.bold(skill)} to the Vercel-maintained version`
    );
  }
  for (const skill of plan.remove) {
    output.log(`  • Remove the deprecated ${chalk.bold(skill)} skill`);
  }

  const interactive = Boolean(client.stdin.isTTY);

  if (!yes && !interactive) {
    // Never mutate files in a non-interactive/agent context without an explicit
    // opt-in; print the exact commands and leave the project untouched.
    output.log('');
    output.log('Run these to apply the change, or re-run with `--yes`:');
    for (const skill of plan.migrate) {
      output.log(`  ${chalk.cyan(migrateCommand(skill))}`);
    }
    for (const skill of plan.remove) {
      output.log(`  ${chalk.cyan(removeCommand(skill))}`);
    }
    return 0;
  }

  if (!yes) {
    const confirmed = await client.input.confirm('Apply this change?', true);
    if (!confirmed) {
      output.log('Canceled.');
      return 0;
    }
  }

  let failures = 0;

  for (const skill of plan.migrate) {
    output.spinner(`Updating ${skill}…`);
    const result = await execa('npx', buildMigrateArgs(skill), {
      cwd: client.cwd,
      stdio: 'pipe',
      reject: false,
    });
    output.stopSpinner();
    if (result.exitCode === 0) {
      output.log(
        `Updated ${chalk.bold(skill)} to the Vercel-maintained version`
      );
    } else {
      failures++;
      output.debug(`skills add failed: ${result.stderr}`);
      output.warn(
        `Failed to update ${skill}. Run it manually: ${chalk.cyan(migrateCommand(skill))}`
      );
    }
  }

  for (const skill of plan.remove) {
    output.spinner(`Removing ${skill}…`);
    const result = await execa('npx', buildRemoveArgs(skill), {
      cwd: client.cwd,
      stdio: 'pipe',
      reject: false,
    });
    output.stopSpinner();
    if (result.exitCode === 0) {
      output.log(`Removed the deprecated ${chalk.bold(skill)} skill`);
    } else {
      failures++;
      output.debug(`skills remove failed: ${result.stderr}`);
      output.warn(
        `Failed to remove ${skill}. Run it manually: ${chalk.cyan(removeCommand(skill))}`
      );
    }
  }

  return failures > 0 ? 1 : 0;
}
