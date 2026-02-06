import { formatOption, yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'Show all webhooks',
  default: true,
  arguments: [],
  options: [formatOption],
  examples: [
    {
      name: 'List all webhooks as JSON',
      value: `${packageName} webhooks ls --format json`,
    },
  ],
} as const;

export const getSubcommand = {
  name: 'get',
  aliases: ['inspect'],
  description: 'Displays information related to a webhook',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [formatOption],
  examples: [],
} as const;

export const createSubcommand = {
  name: 'create',
  aliases: ['add'],
  description: 'Create a new webhook',
  arguments: [
    {
      name: 'url',
      required: true,
    },
  ],
  options: [
    {
      name: 'event',
      shorthand: 'e',
      type: [String],
      argument: 'EVENT',
      deprecated: false,
      description: 'Webhook event to subscribe to (can be used multiple times)',
    },
    {
      name: 'project',
      shorthand: 'p',
      type: [String],
      argument: 'PROJECT_ID',
      deprecated: false,
      description:
        'Project ID to associate with the webhook (can be used multiple times)',
    },
  ],
  examples: [
    {
      name: 'Create a webhook for deployment events',
      value: `${packageName} webhooks create https://example.com/webhook --event deployment.created --event deployment.ready`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description: 'Remove a webhook',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when removing a webhook',
    },
  ],
  examples: [],
} as const;

export const webhooksCommand = {
  name: 'webhooks',
  aliases: ['webhook'],
  description: 'Manage webhooks',
  arguments: [],
  subcommands: [
    listSubcommand,
    getSubcommand,
    createSubcommand,
    removeSubcommand,
  ],
  options: [],
  examples: [],
} as const;
