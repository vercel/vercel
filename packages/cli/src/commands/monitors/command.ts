import {
  formatOption,
  jsonOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';
import {
  monitorsAddHelpSections,
  monitorsUpdateHelpSections,
} from './add-help';

const projectScopeOption = {
  ...projectOption,
  shorthand: 'p',
  description: 'Use a project by name or ID',
} as const;

const listAllOption = {
  name: 'all',
  shorthand: 'a',
  type: Boolean,
  deprecated: false,
  description: 'List all accessible monitors in the selected team',
} as const;

const mutationAllOption = {
  ...listAllOption,
  description: 'Apply the monitor to all projects in the selected team',
} as const;

const deprecatedItemScopeOptions = [
  { ...projectScopeOption, deprecated: true },
  { ...listAllOption, deprecated: true },
] as const;

const bodyOption = {
  name: 'body',
  shorthand: null,
  type: String,
  argument: 'PATH',
  deprecated: false,
  description: 'Read the monitor body from a JSON file',
} as const;

export const monitorsLsSubcommand = {
  name: 'ls',
  aliases: ['list'],
  default: true,
  description: 'List monitors for a project or team',
  arguments: [],
  options: [
    projectScopeOption,
    listAllOption,
    {
      name: 'type',
      shorthand: null,
      type: [String],
      argument: 'TYPE',
      deprecated: false,
      description: 'Filter by monitor type',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'List monitors affecting the linked project',
      value: `${packageName} monitors ls`,
    },
    {
      name: 'List all monitors in the selected team',
      value: `${packageName} monitors ls --all`,
    },
    {
      name: 'Write JSON output',
      value: `${packageName} monitors ls --all --json`,
    },
  ],
} as const;

export const monitorsSchemaSubcommand = {
  name: 'schema',
  aliases: [],
  description: 'Show monitor request fields and examples',
  arguments: [],
  options: [
    {
      name: 'type',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      deprecated: false,
      description: 'Monitor type to describe',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'List supported monitor types',
      value: `${packageName} monitors schema`,
    },
    {
      name: 'Show the built-in monitor schema',
      value: `${packageName} monitors schema --type built-in`,
    },
  ],
} as const;

export const monitorsAddSubcommand = {
  name: 'add',
  aliases: ['create'],
  description: 'Add a monitor from a JSON body',
  helpSections: monitorsAddHelpSections,
  arguments: [],
  options: [
    projectScopeOption,
    mutationAllOption,
    formatOption,
    jsonOption,
    bodyOption,
  ],
  examples: [
    {
      name: 'Create a project-scoped monitor',
      value: `${packageName} monitors add --project my-app --body ./rule.json`,
    },
    {
      name: 'Create a team-wide built-in monitor',
      value: `${packageName} monitors add --all --body ./rule.json`,
    },
  ],
} as const;

export const monitorsInspectSubcommand = {
  name: 'inspect',
  aliases: ['get'],
  description: 'Show one monitor by ID',
  arguments: [{ name: 'monitorId', required: true }],
  options: [...deprecatedItemScopeOptions, formatOption, jsonOption],
  examples: [
    {
      name: 'Inspect a monitor',
      value: `${packageName} monitors inspect ar_abc123`,
    },
    {
      name: 'Write JSON output',
      value: `${packageName} monitors inspect ar_abc123 --json`,
    },
  ],
} as const;

export const monitorsRmSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description: 'Remove a monitor',
  arguments: [{ name: 'monitorId', required: true }],
  options: [...deprecatedItemScopeOptions, formatOption, jsonOption, yesOption],
  examples: [
    {
      name: 'Remove with confirmation',
      value: `${packageName} monitors remove ar_abc123`,
    },
    {
      name: 'Remove without a prompt',
      value: `${packageName} monitors remove ar_abc123 --yes`,
    },
  ],
} as const;

export const monitorsUpdateSubcommand = {
  name: 'update',
  aliases: ['patch'],
  description: "Update a monitor's settings or scope",
  helpSections: monitorsUpdateHelpSections,
  arguments: [{ name: 'monitorId', required: true }],
  options: [
    projectScopeOption,
    mutationAllOption,
    formatOption,
    jsonOption,
    {
      ...bodyOption,
      description: 'Read the partial update body from a JSON file',
    },
  ],
  examples: [
    {
      name: 'Update fields from a file',
      value: `${packageName} monitors update ar_abc123 --body ./patch.json`,
    },
    {
      name: 'Move a monitor to a project',
      value: `${packageName} monitors update ar_abc123 --project my-app`,
    },
  ],
} as const;

const notificationTargetOptions = [
  {
    name: 'webhook',
    shorthand: null,
    type: String,
    argument: 'WEBHOOK_ID',
    deprecated: false,
    description: 'Select an account webhook by ID',
  },
  {
    name: 'slack-channel',
    shorthand: null,
    type: String,
    argument: 'CHANNEL_ID',
    deprecated: false,
    description: 'Select a Slack channel by ID',
  },
  {
    name: 'slack-installation-id',
    shorthand: null,
    type: String,
    argument: 'INSTALLATION_ID',
    deprecated: false,
    description:
      'Slack installation ID. Optional only when the team has exactly one completed Slack installation.',
  },
] as const;

const criticalOnlyOption = {
  name: 'critical-only',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description: 'Notify only when Vercel Agent escalates an alert to Critical',
} as const;

const noCriticalOnlyOption = {
  name: 'no-critical-only',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description: 'Deliver every alert matched by the monitor',
} as const;

export const monitorsNotificationsLsSubcommand = {
  name: 'ls',
  aliases: ['list'],
  default: true,
  description:
    'List notification destinations for all readable monitors or one monitor',
  arguments: [{ name: 'monitorId', required: false }],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'List notification destinations for all readable monitors',
      value: `${packageName} monitors notifications ls`,
    },
    {
      name: 'List notification destinations for one monitor',
      value: `${packageName} monitors notifications ls ar_abc123`,
    },
    {
      name: 'Write JSON output',
      value: `${packageName} monitors notifications ar_abc123 --json`,
    },
  ],
} as const;

export const monitorsNotificationsLinkSubcommand = {
  name: 'link',
  aliases: [],
  description: 'Link a Slack channel or account webhook to a monitor',
  arguments: [{ name: 'monitorId', required: true }],
  options: [
    ...notificationTargetOptions,
    criticalOnlyOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Link a Slack channel',
      value: `${packageName} monitors notifications link ar_abc123 --slack-channel C123`,
    },
    {
      name: 'Link a Slack channel from a specific installation',
      value: `${packageName} monitors notifications link ar_abc123 --slack-channel C123 --slack-installation-id icfg_abc123`,
    },
    {
      name: 'Link a webhook',
      value: `${packageName} monitors notifications link ar_abc123 --webhook wh_abc123`,
    },
    {
      name: 'Link a Critical-only webhook',
      value: `${packageName} monitors notifications link ar_abc123 --webhook wh_abc123 --critical-only`,
    },
  ],
} as const;

export const monitorsNotificationsUpdateSubcommand = {
  name: 'update',
  aliases: ['patch'],
  description: "Update a notification destination's delivery setting",
  arguments: [{ name: 'monitorId', required: true }],
  options: [
    ...notificationTargetOptions,
    criticalOnlyOption,
    noCriticalOnlyOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Restrict a Slack channel to Critical alerts',
      value: `${packageName} monitors notifications update ar_abc123 --slack-channel C123 --critical-only`,
    },
    {
      name: 'Restore delivery for every alert matched by the monitor',
      value: `${packageName} monitors notifications update ar_abc123 --webhook wh_abc123 --no-critical-only`,
    },
  ],
} as const;

export const monitorsNotificationsUnlinkSubcommand = {
  name: 'unlink',
  aliases: [],
  description: 'Unlink a Slack channel or account webhook from a monitor',
  arguments: [{ name: 'monitorId', required: true }],
  options: [...notificationTargetOptions, formatOption, jsonOption],
  examples: [
    {
      name: 'Unlink a Slack channel',
      value: `${packageName} monitors notifications unlink ar_abc123 --slack-channel C123`,
    },
    {
      name: 'Unlink a webhook',
      value: `${packageName} monitors notifications unlink ar_abc123 --webhook wh_abc123`,
    },
  ],
} as const;

export const monitorsNotificationsAggregateCommand = {
  name: 'notifications',
  aliases: [],
  description:
    'List and manage linked Slack and webhook destinations for monitors',
  arguments: [],
  subcommands: [
    monitorsNotificationsLsSubcommand,
    monitorsNotificationsLinkSubcommand,
    monitorsNotificationsUpdateSubcommand,
    monitorsNotificationsUnlinkSubcommand,
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'List destinations for all readable monitors',
      value: `${packageName} monitors notifications`,
    },
    {
      name: 'List destinations for one monitor',
      value: `${packageName} monitors notifications ar_abc123`,
    },
    {
      name: "Link Slack with the team's only installation",
      value: `${packageName} monitors notifications link ar_abc123 --slack-channel C123`,
    },
  ],
} as const;

export const monitorsCommand = {
  name: 'monitors',
  aliases: [],
  description:
    'Add, inspect, list, update, and remove monitors, and manage their notification destinations',
  arguments: [],
  subcommands: [
    monitorsLsSubcommand,
    monitorsSchemaSubcommand,
    monitorsAddSubcommand,
    monitorsInspectSubcommand,
    monitorsRmSubcommand,
    monitorsUpdateSubcommand,
    monitorsNotificationsAggregateCommand,
  ],
  options: monitorsLsSubcommand.options,
  examples: [
    {
      name: 'List monitors for the linked project',
      value: `${packageName} monitors ls`,
    },
    {
      name: 'Add a monitor',
      value: `${packageName} monitors add --project my-app --body ./rule.json`,
    },
    {
      name: 'Inspect a monitor',
      value: `${packageName} monitors inspect ar_abc123`,
    },
    {
      name: 'Update a monitor',
      value: `${packageName} monitors update ar_abc123 --body ./patch.json`,
    },
    {
      name: 'Remove a monitor',
      value: `${packageName} monitors remove ar_abc123`,
    },
    {
      name: 'List notification destinations for a monitor',
      value: `${packageName} monitors notifications ar_abc123`,
    },
  ],
} as const;
