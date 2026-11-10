import { packageName } from '../../util/pkg-name';
import {
  formatOption,
  jsonOption,
  limitOption,
  nextCursorOption,
  sinceOption,
  untilOption,
  yesOption,
} from '../../util/arg-common';

export const inspectSubcommand = {
  name: 'inspect',
  aliases: ['overview'],
  description: "Show this cycle's on-demand spend against Spend Management",
  // `overview` is an unadvertised alias so existing usage still works.
  arguments: [],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: "Show this cycle's on-demand spend against Spend Management",
      value: `${packageName} budgets inspect`,
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List every Spend Management budget on this team, of any scope',
  // Default of `vercel budgets` with no subcommand.
  default: true,
  arguments: [],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'List Spend Management budgets',
      value: `${packageName} budgets`,
    },
  ],
} as const;

export const setSubcommand = {
  name: 'set',
  aliases: ['update'],
  description: "Create or update this team's Spend Management budget",
  arguments: [],
  options: [
    {
      name: 'amount',
      shorthand: null,
      type: Number,
      argument: 'USD',
      deprecated: false,
      description:
        'Budget amount in whole dollars (minimum 1). Creates with 50/75/100% alerts and notifications on; updates keep pause and webhook settings unless those options are also passed',
    },
    {
      name: 'pause',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Pause all projects and production deployments at 100% of the budget amount',
    },
    {
      name: 'no-pause',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Do not pause all projects or their production deployments when the budget is reached',
    },
    {
      name: 'webhook',
      shorthand: null,
      type: String,
      argument: 'URL',
      deprecated: false,
      description: 'Webhook URL to notify when a threshold is reached',
    },
    {
      name: 'no-webhook',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Remove the budget webhook',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Create a $500 budget with default 50/75/100% alerts',
      value: `${packageName} budgets set --amount 500`,
    },
    {
      name: 'Change the budget amount',
      value: `${packageName} budgets set --amount 800`,
    },
    {
      name: 'Pause all projects and production deployments at 100% of the existing budget',
      value: `${packageName} budgets set --pause`,
    },
    {
      name: 'Notify a webhook without changing the amount',
      value: `${packageName} budgets set --webhook https://example.com/hook`,
    },
    {
      name: 'Remove the webhook',
      value: `${packageName} budgets set --no-webhook`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete', 'disable'],
  description: "Remove this team's Spend Management budget",
  arguments: [],
  options: [yesOption, formatOption, jsonOption],
  examples: [
    {
      name: 'Remove the Spend Management budget without confirmation',
      value: `${packageName} budgets remove --yes`,
    },
  ],
} as const;

const alertsDescription =
  'List Spend Management alerts: each budget threshold reached, newest first. For observability alerts, see `vercel alerts`.';

const alertsOptions = [
  {
    ...sinceOption,
    description:
      'Show alerts triggered after this time (ISO 8601 or relative: 1d, 7d, 30d)',
  },
  {
    ...untilOption,
    description:
      'Show alerts triggered before this time (ISO 8601 or relative)',
  },
  limitOption,
  nextCursorOption,
  formatOption,
  jsonOption,
] as const;

export const alertsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: alertsDescription,
  default: true,
  hidden: true,
  arguments: [],
  options: alertsOptions,
  examples: [],
} as const;

export const alertsSubcommand = {
  name: 'alerts',
  aliases: [],
  description: alertsDescription,
  arguments: [],
  subcommands: [alertsListSubcommand],
  options: alertsOptions,
  examples: [
    {
      name: 'List recent Spend Management alerts for this team',
      value: `${packageName} budgets alerts`,
    },
    {
      name: 'List alerts from the last 30 days',
      value: `${packageName} budgets alerts --since 30d`,
    },
    {
      name: 'Output alerts as JSON',
      value: `${packageName} budgets alerts --json`,
    },
  ],
} as const;

export const budgetCommand = {
  name: 'budgets',
  aliases: ['budget'],
  summary: 'Manage spending beyond included credit',
  description:
    'Show and manage Spend Management for on-demand charges after included credit',
  arguments: [],
  subcommands: [
    inspectSubcommand,
    listSubcommand,
    setSubcommand,
    removeSubcommand,
    alertsSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List Spend Management budgets',
      value: `${packageName} budgets`,
    },
    {
      name: "Show this cycle's on-demand spend against Spend Management",
      value: `${packageName} budgets inspect`,
    },
    {
      name: 'Set a $500 budget that pauses all projects and production deployments at 100%',
      value: `${packageName} budgets set --amount 500 --pause`,
    },
    {
      name: 'Pause all projects and production deployments at 100% of the existing budget',
      value: `${packageName} budgets set --pause`,
    },
    {
      name: 'Remove the Spend Management budget',
      value: `${packageName} budgets remove --yes`,
    },
    {
      name: 'List recent Spend Management alerts',
      value: `${packageName} budgets alerts`,
    },
  ],
} as const;
