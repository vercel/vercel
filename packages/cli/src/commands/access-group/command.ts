import { packageName } from '../../util/pkg-name';
import { formatOption, jsonOption } from '../../util/arg-common';

const nameOption = {
  name: 'name',
  shorthand: null,
  type: String,
  argument: 'NAME',
  description: 'The new name for the access group',
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
