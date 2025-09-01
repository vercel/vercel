import { packageName } from '../../util/pkg-name';
import { nextOption, yesOption } from '../../util/arg-common';

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a new project',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Add a new project',
      value: `${packageName} project add my-project`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Displays information related to a project',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [yesOption],
  examples: [
    {
      name: 'Inspect the linked project from the current directory',
      value: `${packageName} project inspect`,
    },
    {
      name: 'Inspect the project named "my-project"',
      value: `${packageName} project inspect my-project`,
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'Show all projects in the selected scope',
  default: true,
  arguments: [],
  options: [
    nextOption,
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output in JSON format',
    },
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
      name: 'Paginate projects, where `1584722256178` is the time in milliseconds since the UNIX epoch',
      value: `${packageName} project ls --next 1584722256178`,
    },
    {
      name: 'List projects using a deprecated Node.js version in JSON format',
      value: `${packageName} project ls --update-required --json`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Delete a project',
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
  description: 'Manage your Vercel projects',
  arguments: [],
  subcommands: [
    addSubcommand,
    inspectSubcommand,
    listSubcommand,
    removeSubcommand,
  ],
  options: [],
  examples: [],
} as const;
