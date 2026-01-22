import chalk from 'chalk';
import { relative } from 'node:path';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { getLinkedProject } from '../../util/projects/link';
import {
  generateAgentFiles,
  getAllFormatConfigs,
} from '../../util/agent-files';
import { AgentsTelemetryClient } from '../../util/telemetry/commands/agents';
import { initSubcommand } from './command';

export default async function init(client: Client) {
  const telemetryClient = new AgentsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments;

  const flagsSpecification = getFlagsSpecification(initSubcommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(3), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const format = parsedArguments.flags['--format'] as string | undefined;
  const force = parsedArguments.flags['--force'] as boolean | undefined;
  const dryRun = parsedArguments.flags['--dry-run'] as boolean | undefined;

  // Track telemetry
  telemetryClient.trackCliArgumentFormat(format);
  telemetryClient.trackCliFlagForce(force);
  telemetryClient.trackCliFlagDryRun(dryRun);

  // Get project info if linked
  let projectName: string | undefined;
  let orgSlug: string | undefined;

  try {
    const linkedProject = await getLinkedProject(client);
    if (linkedProject.status === 'linked') {
      projectName = linkedProject.project?.name;
      orgSlug = linkedProject.org?.slug;
    }
  } catch {
    // Project may not be linked, that's fine
  }

  const cwd = client.cwd;

  if (dryRun) {
    output.print(chalk.cyan('Dry run mode - no files will be written\n\n'));
  }

  const result = await generateAgentFiles({
    cwd,
    format: format as 'markdown' | 'cursorrules' | 'copilot' | 'all' | 'auto',
    force,
    dryRun,
    projectName,
    orgSlug,
  });

  // Track result
  if (result.status === 'generated') {
    for (const file of result.files) {
      telemetryClient.trackAgentFileGenerated(file.format, result.framework);
    }
  } else {
    telemetryClient.trackAgentFileSkipped(result.status);
  }

  switch (result.status) {
    case 'disabled':
      output.print(
        chalk.yellow(
          'Agent file generation is disabled via VERCEL_AGENT_FILES_DISABLED\n'
        )
      );
      return 0;

    case 'exists':
      output.print(
        chalk.yellow(
          'Agent configuration files already exist. Use --force to overwrite.\n'
        )
      );
      output.print('\nExisting files:\n');
      for (const formatConfig of getAllFormatConfigs()) {
        const filePath = formatConfig.filePath(cwd);
        const fs = require('fs');
        if (fs.existsSync(filePath)) {
          output.print(`  ${chalk.dim(relative(cwd, filePath))}\n`);
        }
      }
      return 0;

    case 'error':
      output.error(result.error || 'Unknown error occurred');
      return 1;

    case 'generated':
      if (dryRun) {
        output.print(chalk.green('Would generate the following files:\n\n'));
        for (const file of result.files) {
          output.print(chalk.bold(`--- ${relative(cwd, file.path)} ---\n`));
          if (file.content) {
            // Show first 50 lines
            const lines = file.content.split('\n').slice(0, 50);
            output.print(chalk.dim(lines.join('\n')));
            if (file.content.split('\n').length > 50) {
              output.print(chalk.dim('\n... (truncated)\n'));
            }
          }
          output.print('\n\n');
        }
      } else {
        output.print(chalk.green('Generated agent configuration files:\n\n'));
        for (const file of result.files) {
          output.print(`  ${chalk.green('✓')} ${relative(cwd, file.path)}\n`);
        }
        output.print('\n');
        if (result.framework) {
          output.print(
            chalk.dim(`Detected framework: ${result.framework}\n\n`)
          );
        }
        output.print(
          chalk.dim(
            'These files help AI coding assistants understand Vercel best practices.\n'
          )
        );
        output.print(
          chalk.dim('Run `vercel agents init --force` to regenerate.\n')
        );
      }
      return 0;

    default:
      return 0;
  }
}
