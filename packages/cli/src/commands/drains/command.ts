import { packageName } from '../../util/pkg-name';
import { formatOption, jsonOption, yesOption } from '../../util/arg-common';

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

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove a drain using its ID',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when removing a drain',
    },
    jsonOption,
  ],
  examples: [
    {
      name: 'Remove a drain',
      value: `${packageName} drains rm drn_1a2b3c4d5e6f`,
    },
    {
      name: 'Remove a drain without the confirmation prompt',
      value: `${packageName} drains rm drn_1a2b3c4d5e6f --yes`,
    },
  ],
} as const;

export const pauseSubcommand = {
  name: 'pause',
  aliases: [],
  description: 'Pause a drain using its ID',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [jsonOption],
  examples: [
    {
      name: 'Pause a drain',
      value: `${packageName} drains pause drn_1a2b3c4d5e6f`,
    },
  ],
} as const;

export const resumeSubcommand = {
  name: 'resume',
  aliases: [],
  description: 'Resume a paused drain using its ID',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [jsonOption],
  examples: [
    {
      name: 'Resume a paused drain',
      value: `${packageName} drains resume drn_1a2b3c4d5e6f`,
    },
  ],
} as const;

export const drainsCommand = {
  name: 'drains',
  aliases: [],
  description: 'Manage Log, Trace, and other observability Drains',
  arguments: [],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    removeSubcommand,
    pauseSubcommand,
    resumeSubcommand,
  ],
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
    {
      name: 'Remove a drain',
      value: `${packageName} drains rm drn_a1b2c3d4e5f6`,
    },
    {
      name: 'Pause and resume a drain',
      value: [
        `${packageName} drains pause drn_a1b2c3d4e5f6`,
        `${packageName} drains resume drn_a1b2c3d4e5f6`,
      ],
    },
  ],
} as const;
