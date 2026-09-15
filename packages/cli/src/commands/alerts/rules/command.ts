import {
  formatOption,
  jsonOption,
  projectOption,
  yesOption,
} from '../../../util/arg-common';
import { packageName } from '../../../util/pkg-name';

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
  description: 'List all accessible rules in the selected team',
} as const;

const mutationAllOption = {
  ...listAllOption,
  description: 'Apply the rule to all projects in the selected team',
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
  description: 'Read the alert rule body from a JSON file',
} as const;

export const rulesLsSubcommand = {
  name: 'ls',
  aliases: ['list'],
  description: 'List alert rules for a project or team',
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
      description: 'Filter by rule type: built-in or custom',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'List rules affecting the linked project',
      value: `${packageName} alerts rules ls`,
    },
    {
      name: 'List all rules in the selected team',
      value: `${packageName} alerts rules ls --all`,
    },
    {
      name: 'List custom rules for a project',
      value: `${packageName} alerts rules ls --project my-app --type custom`,
    },
    {
      name: 'Write JSON output',
      value: `${packageName} alerts rules ls --all --json`,
    },
  ],
} as const;

export const rulesSchemaSubcommand = {
  name: 'schema',
  aliases: [],
  description: 'Show alert rule request fields and examples',
  arguments: [],
  options: [
    {
      name: 'type',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      deprecated: false,
      description: 'Rule type to describe: built-in or custom',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'List supported rule types',
      value: `${packageName} alerts rules schema`,
    },
    {
      name: 'Show the built-in rule schema',
      value: `${packageName} alerts rules schema --type built-in`,
    },
    {
      name: 'Show the custom rule schema as JSON',
      value: `${packageName} alerts rules schema --type custom --format json`,
    },
  ],
} as const;

export const rulesAddSubcommand = {
  name: 'add',
  aliases: ['create'],
  description: 'Create an alert rule from a JSON body',
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
      name: 'Create a project-scoped rule',
      value: `${packageName} alerts rules add --project my-app --body ./rule.json`,
    },
    {
      name: 'Create a team-wide built-in rule',
      value: `${packageName} alerts rules add --all --body ./rule.json`,
    },
  ],
} as const;

export const rulesInspectSubcommand = {
  name: 'inspect',
  aliases: ['get'],
  description: 'Show one alert rule by ID',
  arguments: [{ name: 'ruleId', required: true }],
  options: [...deprecatedItemScopeOptions, formatOption, jsonOption],
  examples: [
    {
      name: 'Inspect a rule',
      value: `${packageName} alerts rules inspect ar_abc123`,
    },
    {
      name: 'Write JSON output',
      value: `${packageName} alerts rules inspect ar_abc123 --json`,
    },
  ],
} as const;

export const rulesRmSubcommand = {
  name: 'rm',
  aliases: ['remove', 'delete'],
  description: 'Delete an alert rule',
  arguments: [{ name: 'ruleId', required: true }],
  options: [...deprecatedItemScopeOptions, formatOption, jsonOption, yesOption],
  examples: [
    {
      name: 'Delete with confirmation',
      value: `${packageName} alerts rules rm ar_abc123`,
    },
    {
      name: 'Delete without a prompt',
      value: `${packageName} alerts rules rm ar_abc123 --yes`,
    },
  ],
} as const;

export const rulesUpdateSubcommand = {
  name: 'update',
  aliases: ['patch'],
  description: 'Patch an alert rule or change its scope',
  arguments: [{ name: 'ruleId', required: true }],
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
      value: `${packageName} alerts rules update ar_abc123 --body ./patch.json`,
    },
    {
      name: 'Move a rule to a project',
      value: `${packageName} alerts rules update ar_abc123 --project my-app`,
    },
  ],
} as const;

export const rulesAggregateCommand = {
  name: 'rules',
  aliases: [],
  description: 'Create, inspect, list, update, and delete alert rules',
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
      name: 'List rules for the linked project',
      value: `${packageName} alerts rules ls`,
    },
    {
      name: 'Show the custom rule schema',
      value: `${packageName} alerts rules schema --type custom`,
    },
    {
      name: 'Add a rule',
      value: `${packageName} alerts rules add --project my-app --body ./rule.json`,
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
