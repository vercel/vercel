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

export const accessGroupInspectSubcommand = {
  name: 'access-group',
  aliases: [],
  description:
    'Show details for a team access group by id or slug (requires project-rbac-access-groups)',
  arguments: [
    {
      name: 'id-or-name',
      required: true,
    },
  ],
  options: [formatOption],
  examples: [
    {
      name: 'Inspect an access group',
      value: `${packageName} project access-group my-group-slug`,
    },
  ],
} as const;

export const accessGroupsSubcommand = {
  name: 'access-groups',
  aliases: [],
  description:
    'List access groups linked to a project (requires project-rbac-access-groups)',
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
      description: 'Filter access groups by name',
      deprecated: false,
    },
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      description: 'Limit how many access groups are returned (1-100)',
      deprecated: false,
    },
    {
      name: 'cursor',
      shorthand: null,
      type: String,
      description:
        'Pagination cursor from a previous response (`pagination.next`)',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'List access groups for the linked project',
      value: `${packageName} project access-groups`,
    },
    {
      name: 'JSON output',
      value: `${packageName} project access-groups my-app --format json`,
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

export const projectCommand = {
  name: 'project',
  aliases: ['projects'],
  description: 'Manage your Vercel projects',
  arguments: [],
  subcommands: [
    addSubcommand,
    accessGroupInspectSubcommand,
    accessGroupsSubcommand,
    inspectSubcommand,
    listSubcommand,
    removeSubcommand,
    tokenSubcommand,
  ],
  options: [],
  examples: [],
} as const;
