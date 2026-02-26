import { packageName } from '../../util/pkg-name';
import { formatOption, limitOption, nextOption } from '../../util/arg-common';

export const listSubcommand = {
  name: 'ls',
  aliases: ['list'],
  description: 'List activity events.',
  arguments: [],
  options: [
    {
      name: 'type',
      shorthand: null,
      type: [String],
      argument: 'TYPE',
      deprecated: false,
      description:
        'Filter by event type. Repeatable and comma-separated (e.g. --type login --type deployment-created or --type login,deployment-created).',
    },
    {
      name: 'since',
      shorthand: null,
      type: String,
      argument: 'DATE',
      deprecated: false,
      description:
        'Show events after this date (ISO 8601 or relative: 1d, 7d, 30d).',
    },
    {
      name: 'until',
      shorthand: null,
      type: String,
      argument: 'DATE',
      deprecated: false,
      description: 'Show events before this date (ISO 8601 or relative).',
    },
    {
      name: 'project',
      shorthand: 'p',
      type: String,
      argument: 'NAME_OR_ID',
      deprecated: false,
      description:
        'Filter by project (overrides auto-detected linked project).',
    },
    {
      name: 'all',
      shorthand: 'a',
      type: Boolean,
      deprecated: false,
      description: 'Show all team events (ignore linked project auto-scoping).',
    },
    limitOption,
    nextOption,
    formatOption,
  ],
  examples: [
    {
      name: 'List events for the linked project',
      value: `${packageName} activity ls`,
    },
    {
      name: 'Filter events by multiple types',
      value: `${packageName} activity ls --type login --type deployment-created --since 7d`,
    },
    {
      name: 'Filter events by comma-separated types',
      value: `${packageName} activity ls --type login,deployment-created --since 7d`,
    },
    {
      name: 'List all team events',
      value: `${packageName} activity ls --all --since 30d`,
    },
    {
      name: 'Output JSON',
      value: `${packageName} activity ls --format json | jq '.events[]'`,
    },
  ],
} as const;

export const typesSubcommand = {
  name: 'types',
  aliases: [],
  description: 'List available event types with descriptions.',
  arguments: [],
  options: [formatOption],
  examples: [
    {
      name: 'List all event types',
      value: `${packageName} activity types`,
    },
    {
      name: 'Output JSON',
      value: `${packageName} activity types --format json`,
    },
  ],
} as const;

export const activityCommand = {
  name: 'activity',
  aliases: [],
  description: 'List user activity and audit events.',
  arguments: [],
  subcommands: [listSubcommand, typesSubcommand],
  options: [],
  examples: [
    {
      name: 'List activity events',
      value: `${packageName} activity ls`,
    },
    {
      name: 'List activity event types',
      value: `${packageName} activity types`,
    },
  ],
} as const;
