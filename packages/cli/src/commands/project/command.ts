import { packageName } from '../../util/pkg-name';
import { nextOption } from '../../util/arg-common';

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a new Project',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Add a new Project',
      value: `${packageName} project add my-project`,
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'Show all Projects in the selected scope',
  default: true,
  arguments: [],
  options: [
    nextOption,
    {
      name: 'update-required',
      description: 'A list of projects affected by an upcoming deprecation',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Paginate Projects, where `1584722256178` is the time in milliseconds since the UNIX epoch',
      value: `${packageName} project ls --next 1584722256178`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Delete a Project',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [],
  examples: [],
} as const;

export const projectCommand = {
  name: 'project',
  aliases: ['projects'],
  description: 'Manage your Vercel Projects',
  arguments: [],
  subcommands: [addSubcommand, listSubcommand, removeSubcommand],
  options: [],
  examples: [],
} as const;
