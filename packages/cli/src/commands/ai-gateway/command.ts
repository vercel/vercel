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

export const rulesAddSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add an AI Gateway routing rule',
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
      name: 'source',
      shorthand: null,
      type: String,
      argument: 'MODEL',
      deprecated: false,
      description: 'Model the rule matches (e.g. anthropic/claude-sonnet-4.5)',
    },
    {
      name: 'destination',
      shorthand: null,
      type: String,
      argument: 'MODEL',
      deprecated: false,
      description: 'Target model a rewrite rule routes to',
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
      value: `${packageName} ai-gateway rules add --type rewrite --source anthropic/claude-fable-5 --destination anthropic/claude-opus-4.8`,
    },
    {
      name: 'Deny a model',
      value: `${packageName} ai-gateway rules add --type deny --source openai/gpt-4o`,
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

export const rulesEditSubcommand = {
  name: 'edit',
  aliases: [],
  description: 'Edit an AI Gateway routing rule',
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
      name: 'destination',
      shorthand: null,
      type: String,
      argument: 'MODEL',
      deprecated: false,
      description: 'Target model a rewrite rule routes to',
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
      value: `${packageName} ai-gateway rules edit rule_123 --disable`,
    },
  ],
} as const;

export const rulesRemoveSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description: 'Remove an AI Gateway routing rule',
  arguments: [{ name: 'ruleId', required: true }],
  options: [yesOption, formatOption],
  examples: [
    {
      name: 'Remove a rule',
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
    rulesAddSubcommand,
    rulesListSubcommand,
    rulesEditSubcommand,
    rulesRemoveSubcommand,
  ],
  options: [],
  examples: [],
} as const;

export const setupSubcommand = {
  name: 'setup',
  aliases: [],
  description:
    'Connect local coding agents (Claude Code, Codex, OpenCode, Pi) to the AI Gateway',
  arguments: [],
  options: [
    {
      name: 'agent',
      shorthand: null,
      type: [String],
      argument: 'NAME',
      deprecated: false,
      description:
        'Coding agent to configure, repeatable (claude-code, codex, opencode, pi)',
    },
    {
      name: 'all',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Configure every supported coding agent',
    },
    {
      name: 'key',
      shorthand: null,
      type: String,
      argument: 'KEY',
      deprecated: false,
      description: 'Use an existing AI Gateway API key instead of creating one',
    },
    {
      name: 'budget',
      shorthand: null,
      type: Number,
      argument: 'AMOUNT',
      deprecated: false,
      description:
        'Quota budget in dollars for a newly created key (minimum 1)',
    },
    {
      name: 'refresh-period',
      shorthand: null,
      type: String,
      argument: 'PERIOD',
      deprecated: false,
      description:
        'Quota refresh cadence for a new key: daily, weekly, monthly, or none',
    },
    {
      name: 'include-byok',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Include BYOK usage in the new key quota',
    },
    {
      name: 'expiration',
      shorthand: null,
      type: String,
      argument: 'PERIOD',
      deprecated: false,
      description:
        'Expiry for a new key: 7d, 30d, 60d, 90d, 1y, or none (default: none)',
    },
    {
      name: 'name',
      shorthand: null,
      type: String,
      argument: 'NAME',
      deprecated: false,
      description: 'Name for a newly created API key',
    },
    {
      name: 'reconfigure',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Re-run even if already configured, to rotate the key or switch team',
    },
    {
      name: 'dry-run',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Show what would change without writing any files',
    },
    {
      name: 'no-backup',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Do not write .bak backups of changed files',
    },
    {
      name: 'no-keychain',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Always write the key into config files instead of the macOS Keychain',
    },
    {
      name: 'agent-config',
      shorthand: null,
      type: [String],
      argument: 'AGENT=PATH',
      deprecated: false,
      description:
        "Override an agent's config file path, e.g. claude-code=/path/settings.json (repeatable)",
    },
    {
      name: 'shell-rc',
      shorthand: null,
      type: String,
      argument: 'PATH',
      deprecated: false,
      description: 'Shell rc file to write the env exports into',
    },
    {
      name: 'apply',
      shorthand: null,
      type: String,
      argument: 'MODE',
      deprecated: false,
      description:
        'How to apply non-interactively: edit (write files, default) or prompt (emit an agent prompt on stdout; requires the macOS Keychain)',
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Connect all detected coding agents (creates a key)',
      value: `${packageName} ai-gateway coding-agents setup`,
    },
    {
      name: 'Emit a prompt to hand to a coding agent instead of writing files',
      value: `${packageName} ai-gateway coding-agents setup --apply prompt --yes`,
    },
    {
      name: 'Connect specific agents with a budgeted key',
      value: `${packageName} ai-gateway coding-agents setup --agent claude-code --budget 500 --refresh-period monthly`,
    },
    {
      name: 'Rotate the key on an already-configured setup',
      value: `${packageName} ai-gateway coding-agents setup --reconfigure`,
    },
    {
      name: 'Reuse an existing key and preview changes only',
      value: `${packageName} ai-gateway coding-agents setup --key <key> --dry-run`,
    },
  ],
} as const;

export const codingAgentsSubcommand = {
  name: 'coding-agents',
  aliases: [],
  description: 'Connect local coding agents to the AI Gateway',
  arguments: [],
  subcommands: [setupSubcommand],
  options: [],
  examples: [],
} as const;

export const modelsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List AI Gateway models',
  arguments: [],
  options: [formatOption],
  examples: [
    {
      name: 'List available models',
      value: `${packageName} ai-gateway models ls`,
    },
  ],
} as const;

export const modelsEndpointsSubcommand = {
  name: 'endpoints',
  aliases: [],
  description: 'List provider endpoints for an AI Gateway model',
  arguments: [{ name: 'model', required: true }],
  options: [formatOption],
  examples: [
    {
      name: 'List provider endpoints for a model',
      value: `${packageName} ai-gateway models endpoints anthropic/claude-opus-4.8`,
    },
  ],
} as const;

export const modelsSubcommand = {
  name: 'models',
  aliases: [],
  description: 'Manage AI Gateway models',
  arguments: [],
  subcommands: [modelsListSubcommand, modelsEndpointsSubcommand],
  options: [],
  examples: [],
} as const;

export const budgetsSetSubcommand = {
  name: 'set',
  aliases: [],
  description:
    'Create or update an AI Gateway budget for a scope (team or project <name>)',
  arguments: [
    { name: 'scope', required: true },
    { name: 'name', required: false },
  ],
  options: [
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      argument: 'AMOUNT',
      deprecated: false,
      description: 'Budget limit in dollars (minimum 1)',
    },
    {
      name: 'refresh-period',
      shorthand: null,
      type: String,
      argument: 'PERIOD',
      deprecated: false,
      description:
        'Budget refresh cadence: daily, weekly, monthly, or none (default: monthly)',
    },
    {
      name: 'include-byok',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Include BYOK usage in the budget (default: false)',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Set a team budget',
      value: `${packageName} ai-gateway budgets set team --limit 500 --refresh-period monthly`,
    },
    {
      name: 'Set a project budget',
      value: `${packageName} ai-gateway budgets set project my-project --limit 200`,
    },
  ],
} as const;

export const budgetsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List AI Gateway budgets',
  arguments: [],
  options: [formatOption],
  examples: [
    {
      name: 'List budgets',
      value: `${packageName} ai-gateway budgets ls`,
    },
  ],
} as const;

export const budgetsRemoveSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description:
    'Remove an AI Gateway budget for a scope (team or project <name>)',
  arguments: [
    { name: 'scope', required: true },
    { name: 'name', required: false },
  ],
  options: [yesOption, formatOption],
  examples: [
    {
      name: 'Remove the team budget',
      value: `${packageName} ai-gateway budgets rm team`,
    },
    {
      name: 'Remove a project budget',
      value: `${packageName} ai-gateway budgets rm project my-project`,
    },
  ],
} as const;

export const budgetsDefaultsInspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: "Show the team's AI Gateway budget default policy",
  arguments: [],
  options: [formatOption],
  examples: [
    {
      name: 'Inspect the budget default policy',
      value: `${packageName} ai-gateway budgets defaults inspect`,
    },
  ],
} as const;

export const budgetsDefaultsSetSubcommand = {
  name: 'set',
  aliases: [],
  description:
    "Create or update the team's AI Gateway budget default policy (applies to projects, api keys, and users without an explicit budget)",
  arguments: [],
  options: [
    {
      name: 'per-project',
      shorthand: null,
      type: String,
      argument: 'AMOUNT',
      deprecated: false,
      description:
        "Default budget per project in dollars, or 'none' to clear the tier",
    },
    {
      name: 'per-api-key',
      shorthand: null,
      type: String,
      argument: 'AMOUNT',
      deprecated: false,
      description:
        "Default budget per api key in dollars, or 'none' to clear the tier",
    },
    {
      name: 'per-user',
      shorthand: null,
      type: String,
      argument: 'AMOUNT',
      deprecated: false,
      description:
        "Default budget per user in dollars, or 'none' to clear the tier",
    },
    {
      name: 'refresh-period',
      shorthand: null,
      type: String,
      argument: 'PERIOD',
      deprecated: false,
      description:
        'Budget refresh cadence shared across tiers: daily, weekly, monthly, or none',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Set per-project and per-api-key defaults',
      value: `${packageName} ai-gateway budgets defaults set --per-project 200 --per-api-key 50 --refresh-period monthly`,
    },
    {
      name: 'Clear the per-project default tier',
      value: `${packageName} ai-gateway budgets defaults set --per-project none`,
    },
  ],
} as const;

export const budgetsDefaultsRemoveSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description: "Remove the team's AI Gateway budget default policy",
  arguments: [],
  options: [yesOption, formatOption],
  examples: [
    {
      name: 'Remove the budget default policy',
      value: `${packageName} ai-gateway budgets defaults rm`,
    },
  ],
} as const;

export const budgetsDefaultsSubcommand = {
  name: 'defaults',
  aliases: [],
  description:
    'Manage the team-wide AI Gateway budget default policy (per-project, per-api-key, and per-user tiers)',
  arguments: [],
  subcommands: [
    budgetsDefaultsInspectSubcommand,
    budgetsDefaultsSetSubcommand,
    budgetsDefaultsRemoveSubcommand,
  ],
  options: [],
  examples: [],
} as const;

export const budgetsSubcommand = {
  name: 'budgets',
  aliases: [],
  description: 'Manage AI Gateway budgets (metered spend limits per scope)',
  arguments: [],
  subcommands: [
    budgetsSetSubcommand,
    budgetsListSubcommand,
    budgetsRemoveSubcommand,
    budgetsDefaultsSubcommand,
  ],
  options: [],
  examples: [],
} as const;

export const aiGatewayCommand = {
  name: 'ai-gateway',
  aliases: [],
  description: 'Manage AI Gateway resources',
  arguments: [],
  subcommands: [
    apiKeysSubcommand,
    budgetsSubcommand,
    rulesSubcommand,
    codingAgentsSubcommand,
    modelsSubcommand,
  ],
  options: [],
  examples: [],
} as const;
