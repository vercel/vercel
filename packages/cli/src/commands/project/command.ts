import { packageName } from '../../util/pkg-name';
import {
  formatOption,
  jsonOption,
  nextOption,
  yesOption,
} from '../../util/arg-common';

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
    formatOption,
    jsonOption,
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
      value: `${packageName} project ls --update-required --format=json`,
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

export const tokenSubcommand = {
  name: 'token',
  aliases: [],
  description: 'Get a development OIDC token for a project',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [yesOption],
  examples: [
    {
      name: 'Get a development OIDC token for the linked project',
      value: `${packageName} project token`,
    },
    {
      name: 'Get a development OIDC token for the project named "my-project"',
      value: `${packageName} project token my-project`,
    },
  ],
} as const;

export const membersSubcommand = {
  name: 'members',
  aliases: ['member'],
  description: 'List project members for a project',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [
    formatOption,
    {
      name: 'search',
      shorthand: null,
      type: String,
      description: 'Filter project members by name, username, or email',
      deprecated: false,
    },
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      description: 'Limit number of project members returned (1-100)',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'List members for the linked project',
      value: `${packageName} project members`,
    },
    {
      name: 'List members for a named project as JSON',
      value: `${packageName} project members my-project --format json`,
    },
  ],
} as const;

export const accessGroupsSubcommand = {
  name: 'access-groups',
  aliases: ['accessgroups'],
  description: 'List access groups for a project',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [
    formatOption,
    nextOption,
    {
      name: 'search',
      shorthand: null,
      type: String,
      description: 'Search access groups by name',
      deprecated: false,
    },
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      description: 'Limit number of access groups returned (1-100)',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'List access groups for the linked project',
      value: `${packageName} project access-groups`,
    },
    {
      name: 'List access groups for a named project as JSON',
      value: `${packageName} project access-groups my-project --format json`,
    },
  ],
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
    membersSubcommand,
    accessGroupsSubcommand,
    removeSubcommand,
    tokenSubcommand,
  ],
  options: [],
  examples: [],
} as const;
