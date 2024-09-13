import { packageName } from '../../util/pkg-name';
import { nextOption } from '../../util/arg-common';

const listSubcommand = {
  name: 'ls',
  description: 'Show all projects in the selected scope',
  arguments: [],
  options: [
    {
      name: 'update-required',
      description: 'A list of projects affected by an upcoming deprecation',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      ...nextOption,
      description: 'Show next page of results',
      argument: 'MS',
    },
  ],
  examples: [],
} as const;

const addSubcommand = {
  name: 'add',
  description: 'Add a new project',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [],
  examples: [],
} as const;

const removeSubcommand = {
  name: 'rm',
  description: 'Remove a project',
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
  description: 'Manage your Vercel Projects.',
  arguments: [
    {
      name: 'command',
      required: true,
    },
  ],
  subcommands: [listSubcommand, addSubcommand, removeSubcommand],
  options: [],
  examples: [
    {
      name: 'Add a new project',
      value: `${packageName} project add my-project`,
    },
    {
      name: 'Paginate projects, where `1584722256178` is the time in milliseconds since the UNIX epoch',
      value: `${packageName} project ls --next 1584722256178`,
    },
  ],
} as const;
