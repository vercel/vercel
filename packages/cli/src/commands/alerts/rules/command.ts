import {
  formatOption,
  jsonOption,
  projectOption,
  yesOption,
} from '../../../util/arg-common';
import { packageName } from '../../../util/pkg-name';

const scopeOptions = [
  {
    ...projectOption,
    shorthand: 'p',
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

const addScopeOptions = [
  {
    ...scopeOptions[0],
    description:
      'Target project when the body omits projectId; built-in rules otherwise remain team-wide.',
  },
  scopeOptions[1],
] as const;

export const rulesLsSubcommand = {
  name: 'ls',
  aliases: ['list'],
  description: 'List alert rules for the current scope',
  arguments: [],
  options: [
    ...scopeOptions,
    {
      name: 'type',
      shorthand: null,
      type: [String],
      argument: 'TYPE',
      deprecated: false,
      description:
        'Filter by alert type. Repeatable and comma-separated (for example --type custom_alert).',
    },
    formatOption,
    jsonOption,
  ],
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
      name: 'List custom alert rules',
      value: `${packageName} alerts rules ls --type custom_alert`,
    },
    {
      name: 'JSON output',
      value: `${packageName} alerts rules ls --json`,
    },
  ],
} as const;

export const rulesSchemaSubcommand = {
  name: 'schema',
  aliases: [],
  description: 'Show alert rule body schema and examples by alert type',
  arguments: [],
  options: [
    {
      name: 'type',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      deprecated: false,
      description:
        'Alert rule type to describe: usage_anomaly, error_anomaly, or custom_alert.',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'List supported rule types',
      value: `${packageName} alerts rules schema`,
    },
    {
      name: 'Show error anomaly rule schema',
      value: `${packageName} alerts rules schema --type error_anomaly`,
    },
    {
      name: 'Show custom alert rule schema',
      value: `${packageName} alerts rules schema --type custom_alert`,
    },
    {
      name: 'Schema as JSON',
      value: `${packageName} alerts rules schema --type custom_alert --format json`,
    },
  ],
} as const;

export const rulesAddSubcommand = {
  name: 'add',
  aliases: ['create'],
  description: 'Create an alert rule from a JSON body file',
  arguments: [],
  options: [
    ...addScopeOptions,
    formatOption,
    jsonOption,
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
  options: [...scopeOptions, formatOption, jsonOption],
  examples: [
    {
      name: 'Inspect a rule',
      value: `${packageName} alerts rules inspect ar_abc123`,
    },
    {
      name: 'JSON output',
      value: `${packageName} alerts rules inspect ar_abc123 --json`,
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
  options: [...scopeOptions, formatOption, jsonOption, yesOption],
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
    jsonOption,
    {
      name: 'body',
      shorthand: null,
      type: String,
      argument: 'PATH',
      deprecated: false,
      description:
        'Path to partial JSON. Omitted fields remain unchanged; null clears supported optional fields.',
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
    rulesSchemaSubcommand,
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
      name: 'List custom alert rules',
      value: `${packageName} alerts rules ls --type custom_alert`,
    },
    {
      name: 'Show schema for a rule type',
      value: `${packageName} alerts rules schema --type custom_alert`,
    },
    {
      name: 'Add a rule',
      value: `${packageName} alerts rules add --body ./rule.json`,
    },
    {
      name: 'Inspect a rule',
      value: `${packageName} alerts rules inspect ar_abc123`,
    },
    {
      name: 'Update a rule',
      value: `${packageName} alerts rules update ar_abc123 --body ./patch.json`,
    },
    {
      name: 'Delete a rule',
      value: `${packageName} alerts rules rm ar_abc123`,
    },
  ],
} as const;
