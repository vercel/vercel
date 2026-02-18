import { formatOption, yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List targets defined for the current Project',
  arguments: [],
  options: [
    formatOption,
    {
      ...yesOption,
      description:
        'Skip confirmation when linking is required (e.g. in non-interactive mode)',
    },
  ],
  examples: [
    {
      name: 'List all targets for the current Project',
      value: `${packageName} target ls my-project`,
    },
  ],
} as const;

export const targetCommand = {
  name: 'target',
  aliases: ['targets'],
  description: 'Manage your Vercel Project\'s "targets" (custom environments).',
  arguments: [],
  subcommands: [listSubcommand],
  options: [],
  examples: [],
} as const;
