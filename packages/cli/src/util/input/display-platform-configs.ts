import type { DetectPlatformConfigsResult } from '@vercel/fs-detectors';
import output from '../../output-manager';

const chalk = require('chalk');

/** Max lines of file content to display per file. */
const MAX_DISPLAY_LINES = 20;

/**
 * Display detected platform configuration files in the terminal.
 *
 * Output format:
 *   Platform configuration detected:
 *
 *     Heroku — Procfile, app.json
 *       --- Procfile ---
 *       web: node server.js
 *       worker: node worker.js
 *
 *       --- app.json ---
 *       { "name": "my-app", ... }
 *
 *     Docker — Dockerfile
 *       --- Dockerfile ---
 *       FROM node:18-alpine
 *       ...
 */
export function displayPlatformConfigs(
  result: DetectPlatformConfigsResult
): void {
  output.print(`\n${chalk.bold('Platform configuration detected:')}\n`);

  for (const config of result.configs) {
    const filenames = config.files.map(f => chalk.dim(f.filename)).join(', ');
    output.print(
      `\n  ${chalk.cyan(config.displayName)} ${chalk.dim('—')} ${filenames}\n`
    );

    for (const file of config.files) {
      output.print(`    ${chalk.dim(`--- ${file.filename} ---`)}\n`);

      const lines = file.content.split('\n');
      const displayLines = lines.slice(0, MAX_DISPLAY_LINES);

      for (const line of displayLines) {
        output.print(`    ${chalk.dim(line)}\n`);
      }

      if (lines.length > MAX_DISPLAY_LINES) {
        const remaining = lines.length - MAX_DISPLAY_LINES;
        output.print(
          `    ${chalk.dim(`... ${remaining} more line${remaining === 1 ? '' : 's'}`)}\n`
        );
      }

      output.print('\n');
    }
  }
}
