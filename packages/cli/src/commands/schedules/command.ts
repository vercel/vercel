import {
  environmentOption,
  formatOption,
  gitBranchOption,
  jsonOption,
  limitOption,
  sinceOption,
  untilOption,
  yesOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

const localOption = {
  name: 'local',
  shorthand: null,
  deprecatedShorthand: 'L',
  type: Boolean,
  deprecated: false,
  description: 'Use the local Schedules session started by vercel dev',
} as const;

const namespaceOption = {
  name: 'namespace',
  shorthand: null,
  type: String,
  argument: 'NAMESPACE',
  deprecated: false,
  description: 'Use a schedule namespace (default: default)',
} as const;

const scheduleEnvironmentOption = {
  ...environmentOption,
  description:
    'Use the schedules of an environment: production or a custom environment (default: production)',
} as const;

const scheduleGitBranchOption = {
  ...gitBranchOption,
  description:
    "Use the schedules of a Git branch's deployments in the linked repository",
} as const;

const trackOptions = [
  scheduleEnvironmentOption,
  scheduleGitBranchOption,
] as const;

const nextOption = {
  name: 'next',
  shorthand: null,
  type: String,
  argument: 'CURSOR',
  deprecated: false,
  description: 'Show the next page using the cursor from the previous output',
} as const;

const cronOption = {
  name: 'cron',
  shorthand: null,
  type: String,
  argument: 'EXPRESSION',
  deprecated: false,
  description: 'Use a cron expression',
} as const;

const atOption = {
  name: 'at',
  shorthand: null,
  type: String,
  argument: 'DATETIME',
  deprecated: false,
  description: 'Run once at a local datetime (YYYY-MM-DDTHH:mm or :00 seconds)',
} as const;

const timezoneOption = {
  name: 'timezone',
  shorthand: null,
  type: String,
  argument: 'TIMEZONE',
  deprecated: false,
  description: 'Evaluate expressions in an IANA timezone (default: UTC)',
} as const;

const createJitterOption = {
  name: 'jitter',
  shorthand: null,
  type: Number,
  argument: 'MINUTES',
  deprecated: false,
  description: 'Add a jitter window between 1 and 15 minutes',
} as const;

const updateJitterOption = {
  name: 'jitter',
  shorthand: null,
  type: String,
  argument: 'MINUTES|none',
  deprecated: false,
  description: 'Set jitter to 1–15 minutes, or use none to remove it',
} as const;

const topicOption = {
  name: 'topic',
  shorthand: null,
  type: String,
  argument: 'TOPIC',
  deprecated: false,
  description: 'Target a queue topic',
} as const;

const payloadOption = {
  name: 'payload',
  shorthand: null,
  type: String,
  argument: 'JSON',
  deprecated: false,
  description: 'Set the JSON payload delivered to the target',
} as const;

const updatePayloadOption = {
  ...payloadOption,
  description: 'Replace the JSON payload; use null to remove it',
} as const;

const nameArgument = {
  name: 'name',
  required: true,
} as const;

const scheduleOutputOptions = [formatOption, jsonOption, localOption] as const;

export const createSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create a schedule',
  arguments: [nameArgument],
  options: [
    namespaceOption,
    ...trackOptions,
    cronOption,
    atOption,
    timezoneOption,
    createJitterOption,
    topicOption,
    payloadOption,
    ...scheduleOutputOptions,
  ],
  examples: [
    {
      name: 'Create a recurring schedule',
      value: `${packageName} schedules create daily-cleanup --cron "0 2 * * *" --topic scheduled-cleanup`,
    },
    {
      name: 'Create a one-time schedule',
      value: `${packageName} schedules create send-reminder --at 2026-09-17T10:00 --timezone America/New_York --topic reminders`,
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update a schedule',
  arguments: [nameArgument],
  options: [
    namespaceOption,
    ...trackOptions,
    cronOption,
    atOption,
    timezoneOption,
    updateJitterOption,
    topicOption,
    updatePayloadOption,
    ...scheduleOutputOptions,
  ],
  examples: [
    {
      name: 'Change a recurring schedule',
      value: `${packageName} schedules update daily-cleanup --cron "0 3 * * *"`,
    },
    {
      name: 'Remove a jitter window',
      value: `${packageName} schedules update daily-cleanup --jitter none`,
    },
  ],
} as const;

function actionSubcommand(
  name: 'enable' | 'disable' | 'invoke',
  description: string
) {
  return {
    name,
    aliases: [],
    description,
    arguments: [nameArgument],
    options: [namespaceOption, ...trackOptions, ...scheduleOutputOptions],
    examples: [
      {
        name: `${description} in the default namespace`,
        value: `${packageName} schedules ${name} daily-cleanup`,
      },
    ],
  } as const;
}

const enableUntilOption = {
  ...untilOption,
  description:
    'Enable only until this time, then disable again: ISO 8601 or Unix milliseconds',
} as const;

const enableForOption = {
  name: 'for',
  shorthand: null,
  type: String,
  argument: 'DURATION',
  deprecated: false,
  description: 'Enable only for this long, then disable again (e.g. 30m, 5h)',
} as const;

export const enableSubcommand = {
  ...actionSubcommand('enable', 'Enable a schedule'),
  options: [
    namespaceOption,
    ...trackOptions,
    enableUntilOption,
    enableForOption,
    ...scheduleOutputOptions,
  ],
  examples: [
    {
      name: 'Enable a schedule in the default namespace',
      value: `${packageName} schedules enable daily-cleanup`,
    },
    {
      name: 'Enable a schedule for 2 hours',
      value: `${packageName} schedules enable daily-cleanup --for 2h`,
    },
    {
      name: 'Enable a schedule until a time',
      value: `${packageName} schedules enable daily-cleanup --until 2026-10-09T17:00:00Z`,
    },
  ],
} as const;
export const disableSubcommand = actionSubcommand(
  'disable',
  'Disable a schedule'
);
export const invokeSubcommand = actionSubcommand(
  'invoke',
  'Invoke a schedule immediately'
);

export const deleteSubcommand = {
  name: 'delete',
  aliases: ['rm', 'del'],
  description: 'Delete a schedule',
  arguments: [nameArgument],
  options: [
    namespaceOption,
    ...trackOptions,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when deleting',
    },
    ...scheduleOutputOptions,
  ],
  examples: [
    {
      name: 'Delete a schedule',
      value: `${packageName} schedules delete daily-cleanup`,
    },
    {
      name: 'Delete without confirmation',
      value: `${packageName} schedules delete daily-cleanup --yes`,
    },
  ],
} as const;

const sortOption = {
  name: 'sort',
  shorthand: null,
  type: String,
  argument: 'ORDER',
  deprecated: false,
  description: 'Sort by time: asc or desc (default: desc)',
} as const;

const fromOption = {
  name: 'from',
  shorthand: null,
  type: Number,
  deprecated: true,
} as const;

const toOption = {
  name: 'to',
  shorthand: null,
  type: Number,
  deprecated: true,
} as const;

const executionOption = {
  name: 'execution',
  shorthand: null,
  type: String,
  argument: 'EXECUTION',
  deprecated: false,
  description: 'Filter by execution ID substring',
} as const;

// Hidden: `--execution-id` is the old name of `--execution`.
const executionIdOption = {
  name: 'execution-id',
  shorthand: null,
  type: String,
  argument: 'ID',
  deprecated: true,
  description: 'Deprecated alias for `--execution`',
} as const;

export const executionsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List executions for a schedule',
  arguments: [nameArgument],
  options: [
    namespaceOption,
    ...trackOptions,
    limitOption,
    nextOption,
    sortOption,
    {
      ...sinceOption,
      description:
        'Start time: ISO 8601 or relative, like 1h or 7d (at most 30 days before --until)',
    },
    {
      ...untilOption,
      description:
        'End time: ISO 8601 or relative; requires --since (default: now)',
    },
    fromOption,
    toOption,
    executionOption,
    executionIdOption,
    formatOption,
    jsonOption,
    { ...localOption, description: 'Local execution history is not supported' },
  ],
  examples: [
    {
      name: 'List recent executions for a schedule',
      value: `${packageName} schedules executions list daily-cleanup`,
    },
    {
      name: 'List executions from the last 7 days',
      value: `${packageName} schedules executions list daily-cleanup --since 7d`,
    },
    {
      name: 'List executions in a time range',
      value: `${packageName} schedules executions list daily-cleanup --since 2026-09-01T00:00:00Z --until 2026-09-02T00:00:00Z`,
    },
    {
      name: 'Continue listing executions',
      placeholders: ['<CURSOR>'],
      value: `${packageName} schedules executions list daily-cleanup --next <CURSOR>`,
    },
    {
      name: 'List executions as JSON',
      value: `${packageName} schedules executions list daily-cleanup --json`,
    },
  ],
} as const;

export const executionsSubcommand = {
  name: 'executions',
  aliases: [],
  description: 'Inspect schedule execution history',
  arguments: [],
  subcommands: [executionsListSubcommand],
  options: [
    { ...localOption, description: 'Local execution history is not supported' },
  ],
  examples: [
    {
      name: 'List recent executions for a schedule',
      value: `${packageName} schedules executions list daily-cleanup`,
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List schedules',
  arguments: [],
  options: [
    namespaceOption,
    ...trackOptions,
    limitOption,
    nextOption,
    ...scheduleOutputOptions,
  ],
  examples: [
    {
      name: 'List schedules in the default namespace',
      value: `${packageName} schedules list`,
    },
    {
      name: 'List schedules in another namespace',
      value: `${packageName} schedules list --namespace jobs`,
    },
    {
      name: 'List schedules for a Git branch',
      value: `${packageName} schedules list --git-branch feature`,
    },
    {
      name: 'List schedules for a custom environment',
      value: `${packageName} schedules list --environment staging`,
    },
    {
      name: 'Continue listing schedules',
      placeholders: ['<CURSOR>'],
      value: `${packageName} schedules list --next <CURSOR>`,
    },
    {
      name: 'List schedules as JSON',
      value: `${packageName} schedules list --json`,
    },
  ],
} as const;

export const getSubcommand = {
  name: 'inspect',
  aliases: ['get'],
  description: 'Show a schedule',
  arguments: [nameArgument],
  options: [...scheduleOutputOptions, namespaceOption, ...trackOptions],
  examples: [
    {
      name: 'Show a schedule in the default namespace',
      value: `${packageName} schedules inspect daily-cleanup`,
    },
    {
      name: 'Show a schedule in another namespace',
      value: `${packageName} schedules inspect daily-cleanup --namespace jobs`,
    },
    {
      name: 'Show a schedule as JSON',
      value: `${packageName} schedules inspect daily-cleanup --json`,
    },
  ],
} as const;

export const schedulesCommand = {
  name: 'schedules',
  aliases: [],
  description: 'Manage schedules for the current project',
  arguments: [],
  subcommands: [
    listSubcommand,
    getSubcommand,
    createSubcommand,
    updateSubcommand,
    enableSubcommand,
    disableSubcommand,
    invokeSubcommand,
    deleteSubcommand,
    executionsSubcommand,
  ],
  options: [localOption],
  examples: [],
} as const;
