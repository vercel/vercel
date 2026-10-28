import {
  formatOption,
  jsonOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List environments for the current Project',
  default: true,
  arguments: [],
  options: [
    formatOption,
    jsonOption,
    projectOption,
    {
      ...yesOption,
      description:
        'Skip confirmation when linking is required (e.g. in non-interactive mode)',
    },
  ],
  examples: [
    {
      name: 'List all environments for the current Project',
      value: `${packageName} environments list`,
    },
  ],
} as const;

// `targets` and `target` are the old names of `environments`. They keep
// working and print a deprecation warning.
export const targetCommand = {
  name: 'environments',
  aliases: ['environment', 'targets', 'target'],
  description: 'Manage custom environments for a Project',
  arguments: [],
  subcommands: [listSubcommand],
  options: [],
  examples: [],
} as const;
