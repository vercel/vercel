import { formatOption, projectOption, yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const purchaseSubcommand = {
  name: 'purchase',
  aliases: [],
  description:
    'Purchase or adjust custom environment capacity for the current project',
  arguments: [
    {
      name: 'packs',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt',
    },
    formatOption,
    projectOption,
  ],
  examples: [
    {
      name: 'Purchase 2 packs of custom environments (10 environments)',
      value: `${packageName} target purchase 2 --project my-app`,
    },
    {
      name: 'Remove purchased custom environment capacity',
      value: `${packageName} target purchase 0 --project my-app --yes`,
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List targets defined for the current Project',
  arguments: [],
  options: [
    formatOption,
    projectOption,
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
  subcommands: [listSubcommand, purchaseSubcommand],
  options: [],
  examples: [],
} as const;
