import { formatOption, limitOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const listSubcommand = {
  name: 'ls',
  aliases: ['list'],
  description: '',
  default: true,
  hidden: true,
  arguments: [],
  options: [],
  examples: [],
} as const;

export const alertsCommand = {
  name: 'alerts',
  aliases: [],
  description: 'List alerts for a project or team.',
  arguments: [],
  subcommands: [listSubcommand],
  options: [
    {
      name: 'type',
      shorthand: null,
      type: [String],
      argument: 'TYPE',
      deprecated: false,
      description:
        'Filter by alert type. Repeatable and comma-separated (for example --type usage_anomaly,error_anomaly).',
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
      description:
        'Show team-wide alerts (ignore linked project auto-scoping).',
    },
    {
      name: 'since',
      shorthand: null,
      type: String,
      argument: 'ISO_DATE',
      deprecated: false,
      description:
        'Start of time range (ISO-8601). Defaults to 24 hours ago if not provided.',
    },
    {
      name: 'until',
      shorthand: null,
      type: String,
      argument: 'ISO_DATE',
      deprecated: false,
      description: 'End of time range (ISO-8601). Defaults to now.',
    },
    limitOption,
    formatOption,
  ],
  examples: [
    {
      name: 'List alerts for the linked project',
      value: `${packageName} alerts`,
    },
    {
      name: 'List team-wide alerts',
      value: `${packageName} alerts --all`,
    },
    {
      name: 'Filter by type',
      value: `${packageName} alerts --type usage_anomaly --type error_anomaly`,
    },
    {
      name: 'Output JSON',
      value: `${packageName} alerts --format json`,
    },
    {
      name: 'Custom time range',
      value: `${packageName} alerts --since 2026-03-01T00:00:00.000Z --until 2026-03-02T00:00:00.000Z`,
    },
  ],
} as const;
