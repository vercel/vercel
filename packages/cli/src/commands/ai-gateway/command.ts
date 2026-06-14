import { packageName } from '../../util/pkg-name';
import { formatOption, yesOption } from '../../util/arg-common';

export const createSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create a new AI Gateway API key',
  arguments: [],
  options: [
    {
      name: 'name',
      shorthand: null,
      type: String,
      argument: 'NAME',
      deprecated: false,
      description: 'Human-readable name for the API key',
    },
    {
      name: 'budget',
      shorthand: null,
      type: Number,
      argument: 'AMOUNT',
      deprecated: false,
      description: 'Quota budget amount in dollars (minimum 1)',
    },
    {
      name: 'refresh-period',
      shorthand: null,
      type: String,
      argument: 'PERIOD',
      deprecated: false,
      description:
        'Quota refresh cadence: daily, weekly, monthly, or none (default: none)',
    },
    {
      name: 'include-byok',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Include BYOK usage in quota (default: false)',
    },
  ],
  examples: [
    {
      name: 'Create an API key with defaults',
      value: `${packageName} ai-gateway api-keys create`,
    },
    {
      name: 'Create an API key with a budget',
      value: `${packageName} ai-gateway api-keys create --name my-key --budget 500 --refresh-period monthly`,
    },
  ],
} as const;

export const apiKeysSubcommand = {
  name: 'api-keys',
  aliases: [],
  description: 'Manage AI Gateway API keys',
  arguments: [],
  subcommands: [createSubcommand],
  options: [],
  examples: [],
} as const;

export const rulesCreateSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create an AI Gateway routing rule',
  arguments: [],
  options: [
    {
      name: 'type',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      deprecated: false,
      description: 'Rule type: rewrite or deny',
    },
    {
      name: 'model',
      shorthand: null,
      type: String,
      argument: 'MODEL',
      deprecated: false,
      description: 'Model the rule matches (e.g. anthropic/claude-sonnet-4.5)',
    },
    {
      name: 'rewrite-model',
      shorthand: null,
      type: String,
      argument: 'MODEL',
      deprecated: false,
      description: 'Target model for a rewrite rule',
    },
    {
      name: 'reason',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      deprecated: false,
      description: 'Reason surfaced when the rule applies',
    },
    {
      name: 'description',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      deprecated: false,
      description: 'Human-readable description of the rule',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Rewrite one model to another',
      value: `${packageName} ai-gateway rules create --type rewrite --model anthropic/claude-fable-5 --rewrite-model anthropic/claude-opus-4.8`,
    },
    {
      name: 'Deny a model',
      value: `${packageName} ai-gateway rules create --type deny --model openai/gpt-4o`,
    },
  ],
} as const;

export const rulesListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List AI Gateway routing rules',
  arguments: [],
  options: [
    {
      name: 'include-disabled',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Include disabled rules',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'List routing rules',
      value: `${packageName} ai-gateway rules ls`,
    },
  ],
} as const;

export const rulesUpdateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update an AI Gateway routing rule',
  arguments: [{ name: 'ruleId', required: true }],
  options: [
    {
      name: 'enable',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Enable the rule',
    },
    {
      name: 'disable',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Disable the rule',
    },
    {
      name: 'rewrite-model',
      shorthand: null,
      type: String,
      argument: 'MODEL',
      deprecated: false,
      description: 'Target model for a rewrite rule',
    },
    {
      name: 'reason',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      deprecated: false,
      description: 'Reason surfaced when the rule applies',
    },
    {
      name: 'description',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      deprecated: false,
      description: 'Human-readable description of the rule',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Disable a rule',
      value: `${packageName} ai-gateway rules update rule_123 --disable`,
    },
  ],
} as const;

export const rulesDeleteSubcommand = {
  name: 'delete',
  aliases: ['rm'],
  description: 'Delete an AI Gateway routing rule',
  arguments: [{ name: 'ruleId', required: true }],
  options: [yesOption, formatOption],
  examples: [
    {
      name: 'Delete a rule',
      value: `${packageName} ai-gateway rules rm rule_123`,
    },
  ],
} as const;

export const rulesSubcommand = {
  name: 'rules',
  aliases: [],
  description:
    'Manage AI Gateway routing rules (Beta).\n\nAI Gateway routing rules are in beta and may change before general availability. Avoid relying on them in production.',
  arguments: [],
  subcommands: [
    rulesCreateSubcommand,
    rulesListSubcommand,
    rulesUpdateSubcommand,
    rulesDeleteSubcommand,
  ],
  options: [],
  examples: [],
} as const;

export const aiGatewayCommand = {
  name: 'ai-gateway',
  aliases: [],
  description: 'Manage AI Gateway resources',
  arguments: [],
  subcommands: [apiKeysSubcommand, rulesSubcommand],
  options: [],
  examples: [],
} as const;
