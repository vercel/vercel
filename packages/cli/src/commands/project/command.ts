import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const projectCommand: Command = {
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
          type: 'boolean',
          deprecated: false,
          multi: false,
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
      name: 'next',
      description: 'Show next page of results',
      argument: 'MS',
      shorthand: 'N',
      type: 'string',
      deprecated: false,
      multi: false,
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
};
