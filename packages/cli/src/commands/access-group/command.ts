import { packageName } from '../../util/pkg-name';
import { formatOption, jsonOption, yesOption } from '../../util/arg-common';

const nameOption = {
  name: 'name',
  shorthand: null,
  type: String,
  argument: 'NAME',
  description: 'The new name for the access group',
  deprecated: false,
} as const;

const roleOption = {
  name: 'role',
  shorthand: null,
  type: String,
  argument: 'ROLE',
  description:
    'The project role: ADMIN, PROJECT_VIEWER, PROJECT_DEVELOPER, or PROJECT_GUEST',
  deprecated: false,
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List the access groups on the current team',
  default: true,
  arguments: [],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'List all access groups on the current team',
      value: `${packageName} access-group ls`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show an access group in full',
  arguments: [
    {
      name: 'idOrName',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Show an access group by id or name',
      value: `${packageName} access-group inspect my-access-group`,
    },
  ],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Create an access group',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Create an access group',
      value: `${packageName} access-group add my-access-group`,
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update an access group',
  arguments: [
    {
      name: 'idOrName',
      required: true,
    },
  ],
  options: [nameOption, formatOption, jsonOption],
  examples: [
    {
      name: 'Rename an access group',
      value: `${packageName} access-group update my-access-group --name renamed-group`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove an access group',
  arguments: [
    {
      name: 'idOrName',
      required: true,
    },
  ],
  options: [yesOption],
  examples: [
    {
      name: 'Remove an access group',
      value: `${packageName} access-group rm my-access-group`,
    },
  ],
} as const;

export const membersListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List the members of an access group',
  default: true,
  arguments: [
    {
      name: 'group',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'List the members of an access group',
      value: `${packageName} access-group members ls my-access-group`,
    },
  ],
} as const;

export const membersAddSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a member to an access group',
  arguments: [
    {
      name: 'group',
      required: true,
    },
    {
      name: 'member',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Add a member (by id, email, or username) to an access group',
      value: `${packageName} access-group members add my-access-group user@example.com`,
    },
  ],
} as const;

export const membersRemoveSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove a member from an access group',
  arguments: [
    {
      name: 'group',
      required: true,
    },
    {
      name: 'member',
      required: true,
    },
  ],
  options: [yesOption],
  examples: [
    {
      name: 'Remove a member (by id, email, or username) from an access group',
      value: `${packageName} access-group members rm my-access-group user@example.com`,
    },
  ],
} as const;

export const membersSubcommand = {
  name: 'members',
  aliases: [],
  description: 'Manage the members of an access group',
  arguments: [],
  subcommands: [
    membersListSubcommand,
    membersAddSubcommand,
    membersRemoveSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List the members of an access group',
      value: `${packageName} access-group members ls my-access-group`,
    },
  ],
} as const;

export const projectsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List the projects of an access group',
  default: true,
  arguments: [
    {
      name: 'group',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'List the projects of an access group',
      value: `${packageName} access-group projects ls my-access-group`,
    },
  ],
} as const;

export const projectsAddSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a project to an access group',
  arguments: [
    {
      name: 'group',
      required: true,
    },
    {
      name: 'project',
      required: true,
    },
  ],
  options: [roleOption],
  examples: [
    {
      name: 'Add a project to an access group with a role',
      value: `${packageName} access-group projects add my-access-group my-project --role PROJECT_VIEWER`,
    },
  ],
} as const;

export const projectsSubcommand = {
  name: 'projects',
  aliases: [],
  description: 'Manage the projects of an access group',
  arguments: [],
  subcommands: [projectsListSubcommand, projectsAddSubcommand],
  options: [],
  examples: [
    {
      name: 'List the projects of an access group',
      value: `${packageName} access-group projects ls my-access-group`,
    },
  ],
} as const;

export const accessGroupCommand = {
  name: 'access-group',
  aliases: ['access-groups'],
  description: 'Manage team Access Groups and their members and projects',
  arguments: [],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    addSubcommand,
    updateSubcommand,
    removeSubcommand,
    membersSubcommand,
    projectsSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List all access groups on the current team',
      value: `${packageName} access-group ls`,
    },
    {
      name: 'Show an access group by id or name',
      value: `${packageName} access-group inspect ag_1a2b3c4d5e6f`,
    },
  ],
} as const;
