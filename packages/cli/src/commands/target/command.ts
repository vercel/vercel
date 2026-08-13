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
  description: 'List targets defined for the current Project',
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
      name: 'List all targets for the current Project',
      value: `${packageName} target ls my-project`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show a custom environment in full',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
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
      name: 'Show a custom environment in full',
      value: `${packageName} target inspect my-environment`,
    },
    {
      name: 'Show a custom environment as JSON',
      value: `${packageName} target inspect my-environment --json`,
    },
  ],
} as const;

export const targetCommand = {
  name: 'target',
  aliases: ['targets'],
  description: 'Manage your Vercel Project\'s "targets" (custom environments).',
  arguments: [],
  subcommands: [listSubcommand, inspectSubcommand],
  options: [],
  examples: [],
} as const;
