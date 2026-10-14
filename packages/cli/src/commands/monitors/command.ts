import {
  formatOption,
  jsonOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

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
      description: 'Filter by monitor type: built-in or custom',
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
      name: 'List custom monitors for a project',
      value: `${packageName} monitors ls --project my-app --type custom`,
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
      description: 'Monitor type to describe: built-in or custom',
    },
    formatOption,
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
    {
      name: 'Show the custom monitor schema as JSON',
      value: `${packageName} monitors schema --type custom --format json`,
    },
  ],
} as const;

export const monitorsAddSubcommand = {
  name: 'add',
  aliases: ['create'],
  description: 'Create a monitor from a JSON body',
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
  name: 'rm',
  aliases: ['remove', 'delete'],
  description: 'Delete a monitor',
  arguments: [{ name: 'monitorId', required: true }],
  options: [...deprecatedItemScopeOptions, formatOption, jsonOption, yesOption],
  examples: [
    {
      name: 'Delete with confirmation',
      value: `${packageName} monitors rm ar_abc123`,
    },
    {
      name: 'Delete without a prompt',
      value: `${packageName} monitors rm ar_abc123 --yes`,
    },
  ],
} as const;

export const monitorsUpdateSubcommand = {
  name: 'update',
  aliases: ['patch'],
  description: 'Patch a monitor or change its scope',
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

export const monitorsCommand = {
  name: 'monitors',
  aliases: [],
  description: 'Create, inspect, list, update, and delete monitors',
  arguments: [],
  subcommands: [
    monitorsLsSubcommand,
    monitorsSchemaSubcommand,
    monitorsAddSubcommand,
    monitorsInspectSubcommand,
    monitorsRmSubcommand,
    monitorsUpdateSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List monitors for the linked project',
      value: `${packageName} monitors ls`,
    },
    {
      name: 'Show the custom monitor schema',
      value: `${packageName} monitors schema --type custom`,
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
      name: 'Delete a monitor',
      value: `${packageName} monitors rm ar_abc123`,
    },
  ],
} as const;
