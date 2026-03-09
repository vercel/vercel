import { formatOption, yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const statusSubcommand = {
  name: 'status',
  aliases: ['st'],
  description:
    'Show Web Analytics, Speed Insights, and Insights status for a project',
  default: true,
  arguments: [],
  options: [
    {
      name: 'project',
      shorthand: 'p',
      type: String,
      deprecated: false,
      description: 'Project name or ID (default: linked project)',
      argument: 'NAME',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Show analytics status for linked project',
      value: `${packageName} analytics status`,
    },
    {
      name: 'Show status as JSON',
      value: `${packageName} analytics status --format json`,
    },
  ],
} as const;

export const enableSubcommand = {
  name: 'enable',
  aliases: [],
  description:
    'Enable Web Analytics, Speed Insights, or Insights for a project',
  arguments: [
    {
      name: 'feature',
      required: true,
    },
  ],
  options: [
    {
      name: 'project',
      shorthand: 'p',
      type: String,
      deprecated: false,
      description: 'Project name or ID (default: linked project)',
      argument: 'NAME',
    },
  ],
  examples: [
    {
      name: 'Enable Web Analytics',
      value: `${packageName} analytics enable web-analytics`,
    },
    {
      name: 'Enable Speed Insights',
      value: `${packageName} analytics enable speed-insights`,
    },
  ],
} as const;

export const disableSubcommand = {
  name: 'disable',
  aliases: [],
  description:
    'Disable Web Analytics, Speed Insights, or Insights for a project',
  arguments: [
    {
      name: 'feature',
      required: true,
    },
  ],
  options: [
    {
      name: 'project',
      shorthand: 'p',
      type: String,
      deprecated: false,
      description: 'Project name or ID (default: linked project)',
      argument: 'NAME',
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Disable Web Analytics',
      value: `${packageName} analytics disable web-analytics`,
    },
  ],
} as const;

export const alertsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List monitoring alerts for the team',
  default: true,
  arguments: [],
  options: [formatOption],
  examples: [],
} as const;

export const alertsGetSubcommand = {
  name: 'get',
  aliases: ['inspect'],
  description: 'Get a monitoring alert by ID',
  arguments: [{ name: 'alert-id', required: true }],
  options: [formatOption],
  examples: [],
} as const;

export const alertsCreateSubcommand = {
  name: 'create',
  aliases: ['add'],
  description: 'Create a monitoring alert',
  arguments: [],
  options: [
    {
      name: 'name',
      shorthand: 'n',
      type: String,
      deprecated: false,
      description: 'Alert name',
      argument: 'NAME',
    },
    {
      name: 'subscribers',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Comma-separated user IDs to notify',
      argument: 'IDS',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Read full alert payload from stdin (JSON)',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Create alert with name and subscribers',
      value: `${packageName} analytics alerts create --name "High Error Rate" --subscribers user_xxx`,
    },
  ],
} as const;

export const alertsUpdateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update a monitoring alert',
  arguments: [{ name: 'alert-id', required: true }],
  options: [
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Read full alert payload from stdin (JSON)',
    },
    formatOption,
  ],
  examples: [],
} as const;

export const alertsDeleteSubcommand = {
  name: 'delete',
  aliases: ['rm', 'remove'],
  description: 'Delete a monitoring alert',
  arguments: [{ name: 'alert-id', required: true }],
  options: [yesOption, formatOption],
  examples: [],
} as const;

export const alertsValidateWebhookSubcommand = {
  name: 'validate-webhook',
  aliases: [],
  description: 'Validate a PagerDuty (or webhook) config for alerts',
  arguments: [],
  options: [
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Read config from stdin (JSON: { configKind, config })',
    },
    formatOption,
  ],
  examples: [],
} as const;

export const alertsSubcommand = {
  name: 'alerts',
  aliases: [],
  description: 'Manage monitoring alerts',
  arguments: [],
  subcommands: [
    alertsListSubcommand,
    alertsGetSubcommand,
    alertsCreateSubcommand,
    alertsUpdateSubcommand,
    alertsDeleteSubcommand,
    alertsValidateWebhookSubcommand,
  ],
  options: [],
  examples: [],
} as const;

export const analyticsCommand = {
  name: 'analytics',
  aliases: [],
  description:
    'Manage Web Analytics, Speed Insights, Insights, and monitoring alerts',
  arguments: [],
  subcommands: [
    statusSubcommand,
    enableSubcommand,
    disableSubcommand,
    alertsSubcommand,
  ],
  options: [
    {
      name: 'project',
      shorthand: 'p',
      type: String,
      deprecated: false,
      description: 'Project name or ID (default: linked project)',
      argument: 'NAME',
    },
    formatOption,
    yesOption,
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Read payload from stdin (JSON)',
    },
  ],
  examples: [],
} as const;
