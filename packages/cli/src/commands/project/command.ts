import { packageName } from '../../util/pkg-name';
import { nextOption } from '../../util/arg-common';

export const projectCommand = {
  name: 'project',
  description: 'Manage your Vercel Projects.',
  arguments: [
    {
      name: 'command',
      required: true,
    },
  ],
  subcommands: [
    {
      name: 'ls',
      description: 'Show all projects in the selected scope',
      arguments: [],
      options: [
        {
          name: 'update-required',
          description: 'A list of projects affected by an upcoming deprecation',
          argument: 'update-required',
          shorthand: null,
          type: Boolean,
          deprecated: false,
        },
      ],
      examples: [],
    },
    {
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
    },
    {
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
    },
  ],
  options: [
    {
      ...nextOption,
      description: 'Show next page of results',
      argument: 'MS',
    },
    {
      name: 'update-required',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
  ],
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
