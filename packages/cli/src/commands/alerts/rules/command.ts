import { formatOption, yesOption } from '../../../util/arg-common';
import { packageName } from '../../../util/pkg-name';

const scopeOptions = [
  {
    name: 'project',
    shorthand: 'p',
    type: String,
    argument: 'NAME_OR_ID',
    deprecated: false,
    description:
      'Project scope (overrides linked project). Requires team context.',
  },
  {
    name: 'all',
    shorthand: 'a',
    type: Boolean,
    deprecated: false,
    description:
      'Team-wide rules only (omit project filter; ignore linked project).',
  },
] as const;

export const rulesLsSubcommand = {
  name: 'ls',
  aliases: ['list'],
  description: 'List alert rules for the current scope',
  arguments: [],
  options: [...scopeOptions, formatOption],
  examples: [
    {
      name: 'List rules for the linked project',
      value: `${packageName} alerts rules ls`,
    },
    {
      name: 'List team-wide rules',
      value: `${packageName} alerts rules ls --all`,
    },
    {
      name: 'JSON output',
      value: `${packageName} alerts rules ls --format json`,
    },
  ],
} as const;

export const rulesAddSubcommand = {
  name: 'add',
  aliases: ['create'],
  description: 'Create an alert rule from a JSON body file',
  arguments: [],
  options: [
    ...scopeOptions,
    formatOption,
    {
      name: 'body',
      shorthand: null,
      type: String,
      argument: 'PATH',
      deprecated: false,
      description:
        'Path to JSON for the new rule. Do not include id or teamId; the API assigns them.',
    },
  ],
  examples: [
    {
      name: 'Create from file',
      value: `${packageName} alerts rules add --body ./rule.json`,
    },
  ],
} as const;

export const rulesInspectSubcommand = {
  name: 'inspect',
  aliases: ['get'],
  description: 'Show one alert rule by id',
  arguments: [
    {
      name: 'ruleId',
      required: true,
    },
  ],
  options: [...scopeOptions, formatOption],
  examples: [
    {
      name: 'Inspect a rule',
      value: `${packageName} alerts rules inspect ar_abc123`,
    },
    {
      name: 'JSON output',
      value: `${packageName} alerts rules inspect ar_abc123 --format json`,
    },
  ],
} as const;

export const rulesRmSubcommand = {
  name: 'rm',
  aliases: ['remove', 'delete'],
  description: 'Delete an alert rule',
  arguments: [
    {
      name: 'ruleId',
      required: true,
    },
  ],
  options: [...scopeOptions, formatOption, yesOption],
  examples: [
    {
      name: 'Delete with confirmation',
      value: `${packageName} alerts rules rm ar_abc123`,
    },
    {
      name: 'Delete without prompt',
      value: `${packageName} alerts rules rm ar_abc123 --yes`,
    },
  ],
} as const;

export const rulesUpdateSubcommand = {
  name: 'update',
  aliases: ['patch'],
  description: 'Patch an alert rule from a JSON body file',
  arguments: [
    {
      name: 'ruleId',
      required: true,
    },
  ],
  options: [
    ...scopeOptions,
    formatOption,
    {
      name: 'body',
      shorthand: null,
      type: String,
      argument: 'PATH',
      deprecated: false,
      description: 'Path to JSON with fields to update (partial document).',
    },
  ],
  examples: [
    {
      name: 'Update from file',
      value: `${packageName} alerts rules update ar_abc123 --body ./patch.json`,
    },
  ],
} as const;

export const rulesAggregateCommand = {
  name: 'rules',
  aliases: [],
  description:
    'Create, list, update, or delete alert notification rules (dashboard parity).',
  arguments: [],
  subcommands: [
    rulesLsSubcommand,
    rulesAddSubcommand,
    rulesInspectSubcommand,
    rulesRmSubcommand,
    rulesUpdateSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List rules',
      value: `${packageName} alerts rules ls`,
    },
    {
      name: 'Add a rule',
      value: `${packageName} alerts rules add --body ./rule.json`,
    },
  ],
} as const;
