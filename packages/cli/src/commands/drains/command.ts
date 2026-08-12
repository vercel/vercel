import { packageName } from '../../util/pkg-name';
import { formatOption, jsonOption } from '../../util/arg-common';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all drains on the current scope',
  default: true,
  arguments: [],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'List all drains on the current scope',
      value: `${packageName} drains ls`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show a drain in full',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Show a drain in full',
      value: `${packageName} drains inspect drn_1a2b3c4d5e6f`,
    },
  ],
} as const;

export const drainsCommand = {
  name: 'drains',
  aliases: [],
  description: 'Manage Log, Trace, and other observability Drains',
  arguments: [],
  subcommands: [listSubcommand, inspectSubcommand],
  options: [],
  examples: [
    {
      name: 'List all drains on the current scope',
      value: `${packageName} drains ls`,
    },
    {
      name: 'Show a drain in full',
      value: `${packageName} drains inspect drn_a1b2c3d4e5f6`,
    },
  ],
} as const;
