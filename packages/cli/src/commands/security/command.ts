import { packageName } from '../../util/pkg-name';
import { formatOption, jsonOption, projectOption } from '../../util/arg-common';

export const checkSubcommand = {
  name: 'check',
  aliases: [],
  description:
    'Run the security checks for the current team and show each check with its risk level, status, violation count, and muted findings. Pass check slugs to compute only those checks and list their findings',
  default: true,
  arguments: [
    {
      name: 'check',
      required: false,
      multiple: true,
    },
  ],
  options: [
    {
      name: 'findings',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'List individual findings under each check, including muted ones. Implied when a check slug is passed',
    },
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      argument: 'N',
      deprecated: false,
      description:
        'Max findings returned per check (currently capped at 200 by the API). Violation counts are always exact even when findings are capped',
    },
    {
      ...projectOption,
      shorthand: 'p',
      description: 'Scope the report to one project',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Run all security checks',
      value: `${packageName} security check`,
    },
    {
      name: 'Deep-dive one check and its findings',
      value: `${packageName} security check pats-no-expiration`,
    },
    {
      name: 'Output the raw report as JSON',
      value: `${packageName} security check --json`,
    },
  ],
} as const;

export const securityCommand = {
  name: 'security',
  aliases: [],
  description: 'Inspect the security posture of the current team',
  arguments: [],
  subcommands: [checkSubcommand],
  options: [],
  examples: [],
} as const;
