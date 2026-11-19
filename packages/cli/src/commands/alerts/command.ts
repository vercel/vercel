import {
  formatOption,
  jsonOption,
  limitOption,
  nextCursorOption,
  projectOption,
  sinceOption,
  untilOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

const typeOption = {
  name: 'type',
  shorthand: null,
  type: [String],
  argument: 'TYPE',
  deprecated: false,
  description:
    'Filter by alert type. Repeatable and comma-separated (for example --type usage_anomaly,error_anomaly).',
} as const;

const alertsProjectOption = {
  ...projectOption,
  shorthand: 'p',
  description: 'Filter by project (overrides auto-detected linked project).',
} as const;

const allOption = {
  name: 'all',
  shorthand: 'a',
  type: Boolean,
  deprecated: false,
  description: 'Show team-wide alerts (ignore linked project auto-scoping).',
} as const;

const aiOption = {
  name: 'ai',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description:
    'Print AI-focused sections (title, resolved time, summary, key findings) instead of table output.',
} as const;

const alertFilterOptions = [
  typeOption,
  alertsProjectOption,
  allOption,
] as const;

const alertRangeOptions = [
  {
    ...sinceOption,
    description: `${sinceOption.description} (default: 24h ago)`,
  },
  untilOption,
  limitOption,
  formatOption,
  jsonOption,
] as const;

/** Options for the `acknowledged` and `muted` lists, which page with `--next`. */
const alertViewOptions = [
  ...alertFilterOptions,
  {
    ...sinceOption,
    description: `${sinceOption.description}. Matches groups by their latest event (default: the last 3 months)`,
  },
  untilOption,
  limitOption,
  nextCursorOption,
  formatOption,
  jsonOption,
] as const;

const groupArgument = { name: 'group', required: true } as const;

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

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show details for a single alert group',
  arguments: [
    {
      name: 'groupId',
      required: true,
    },
  ],
  options: [
    formatOption,
    jsonOption,
    {
      ...projectOption,
      shorthand: 'p',
      description:
        'Filter by project (overrides auto-detected linked project).',
    },
    {
      name: 'all',
      shorthand: 'a',
      type: Boolean,
      deprecated: false,
      description: 'Use team-wide scope (ignore linked project auto-scoping).',
    },
  ],
  examples: [
    {
      name: 'Inspect a group in the linked project',
      value: `${packageName} alerts inspect grp_abc123`,
    },
    {
      name: 'Inspect as JSON',
      value: `${packageName} alerts inspect grp_abc123 --json`,
    },
  ],
} as const;

export const acknowledgedSubcommand = {
  name: 'acknowledged',
  aliases: [],
  description: 'List acknowledged alert groups, newest event first',
  arguments: [],
  options: alertViewOptions,
  examples: [
    {
      name: 'List acknowledged alerts for the linked project',
      value: `${packageName} alerts acknowledged`,
    },
    {
      name: 'List acknowledged alerts across the team as JSON',
      value: `${packageName} alerts acknowledged --all --json`,
    },
  ],
} as const;

export const mutedSubcommand = {
  name: 'muted',
  aliases: [],
  description:
    'List alert groups that have mutes created from them, newest event first',
  arguments: [],
  options: alertViewOptions,
  examples: [
    {
      name: 'List muted alerts for the linked project',
      value: `${packageName} alerts muted`,
    },
    {
      name: 'List muted alerts across the team from the last 7 days',
      value: `${packageName} alerts muted --all --since 7d`,
    },
  ],
} as const;

export const acknowledgeSubcommand = {
  name: 'acknowledge',
  aliases: [],
  description:
    'Acknowledge an alert group. Acknowledging does not stop notifications; use `mute` for that.',
  arguments: [groupArgument],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Acknowledge an alert group',
      value: `${packageName} alerts acknowledge grp_abc123`,
    },
  ],
} as const;

export const unacknowledgeSubcommand = {
  name: 'unacknowledge',
  aliases: [],
  description: 'Remove the acknowledgement from an alert group',
  arguments: [groupArgument],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Unacknowledge an alert group',
      value: `${packageName} alerts unacknowledge grp_abc123`,
    },
  ],
} as const;

export const muteSubcommand = {
  name: 'mute',
  aliases: [],
  description:
    "Mute an alert group's detections. Matching future detections in the project are suppressed, including in other alert groups.",
  arguments: [groupArgument],
  options: [
    {
      name: 'duration',
      shorthand: null,
      type: String,
      argument: 'DURATION',
      deprecated: false,
      description:
        'How long the mute lasts, from 1m to 365d (for example 1h, 8h, 7d), or `forever` (default: 24h). Running it on a muted group changes how long the existing mutes last.',
    },
    {
      name: 'detection',
      shorthand: null,
      type: String,
      argument: 'DETECTION',
      deprecated: false,
      description:
        "Mute only this detection's pattern instead of every detection in the group",
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Mute an alert group for 24 hours',
      value: `${packageName} alerts mute grp_abc123`,
    },
    {
      name: 'Mute an alert group for 7 days',
      value: `${packageName} alerts mute grp_abc123 --duration 7d`,
    },
    {
      name: 'Mute an alert group until it is unmuted',
      value: `${packageName} alerts mute grp_abc123 --duration forever`,
    },
  ],
} as const;

export const unmuteSubcommand = {
  name: 'unmute',
  aliases: [],
  description: 'Remove every mute created from an alert group',
  arguments: [groupArgument],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Unmute an alert group',
      value: `${packageName} alerts unmute grp_abc123`,
    },
  ],
} as const;

export const alertsCommand = {
  name: 'alerts',
  aliases: [],
  description:
    'List alert groups, inspect, acknowledge, or mute them. To manage alert rules, see `vercel monitors`.',
  arguments: [],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    acknowledgedSubcommand,
    mutedSubcommand,
    acknowledgeSubcommand,
    unacknowledgeSubcommand,
    muteSubcommand,
    unmuteSubcommand,
  ],
  options: [...alertFilterOptions, aiOption, ...alertRangeOptions],
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
      value: `${packageName} alerts --json`,
    },
    {
      name: 'Custom time range',
      value: `${packageName} alerts --since 2026-03-01T00:00:00.000Z --until 2026-03-02T00:00:00.000Z`,
    },
    {
      name: 'List acknowledged or muted alerts',
      value: `${packageName} alerts acknowledged`,
    },
    {
      name: 'Acknowledge or mute an alert group',
      value: `${packageName} alerts mute grp_abc123 --duration 8h`,
    },
  ],
} as const;
