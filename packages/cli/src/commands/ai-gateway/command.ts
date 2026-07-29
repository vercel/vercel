import { packageName } from '../../util/pkg-name';
import { formatOption, jsonOption, yesOption } from '../../util/arg-common';

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
    {
      name: 'alert-thresholds',
      shorthand: null,
      type: String,
      argument: 'LIST',
      deprecated: false,
      description:
        'Comma-separated spend percentages to alert at, a subset of 50,75,100 (e.g. 75,100)',
    },
    {
      name: 'expiration',
      shorthand: null,
      type: String,
      argument: 'PERIOD',
      deprecated: false,
      description:
        'Expiry for the key: 7d, 30d, 60d, 90d, 1y, or none (default: none)',
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
    {
      name: 'Create a key that expires and alerts on spend',
      value: `${packageName} ai-gateway api-keys create --budget 500 --alert-thresholds 75,100 --expiration 90d`,
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List AI Gateway API keys',
  arguments: [],
  options: [formatOption],
  examples: [
    {
      name: 'List API keys',
      value: `${packageName} ai-gateway api-keys ls`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show details about an AI Gateway API key',
  arguments: [{ name: 'id', required: true }],
  options: [formatOption],
  examples: [
    {
      name: 'Inspect an API key',
      value: `${packageName} ai-gateway api-keys inspect key_123`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description: 'Remove an AI Gateway API key',
  arguments: [{ name: 'id', required: true }],
  options: [yesOption, formatOption],
  examples: [
    {
      name: 'Remove an API key',
      value: `${packageName} ai-gateway api-keys rm key_123`,
    },
  ],
} as const;

export const apiKeysSubcommand = {
  name: 'api-keys',
  aliases: [],
  description: 'Manage AI Gateway API keys',
  arguments: [],
  subcommands: [
    createSubcommand,
    listSubcommand,
    inspectSubcommand,
    removeSubcommand,
  ],
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
    jsonOption,
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
    jsonOption,
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
    jsonOption,
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
  options: [yesOption, formatOption, jsonOption],
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
    {
      name: 'base-url',
      shorthand: null,
      type: String,
      argument: 'URL',
      deprecated: false,
      description:
        'Override the AI Gateway base URL written into agent configs (advanced; e.g. a preview deployment). Written verbatim.',
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
    {
      name: 'Point an agent at a different gateway base URL',
      value: `${packageName} ai-gateway coding-agents setup --agent codex --base-url https://preview.ai-gateway.vercel.sh/v1`,
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
  options: [formatOption, jsonOption],
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
  options: [formatOption, jsonOption],
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
    jsonOption,
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
  options: [formatOption, jsonOption],
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
  options: [yesOption, formatOption, jsonOption],
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

const leaderboardFormatOption = {
  name: 'format',
  shorthand: 'F',
  type: String,
  argument: 'FORMAT',
  deprecated: false,
  description:
    'Output format: table, json, or csv (default: table in a terminal, json otherwise)',
} as const;

const leaderboardOutOption = {
  name: 'out',
  shorthand: 'o',
  type: String,
  argument: 'FILE',
  deprecated: false,
  description:
    'Write the payload to a file instead of stdout (defaults to json; use --format csv for CSV)',
} as const;

const leaderboardModalityOption = {
  name: 'modality',
  shorthand: null,
  type: String,
  argument: 'MODALITY',
  deprecated: false,
  description: 'Filter by modality: all, text, image, or video (default: all)',
} as const;

const leaderboardMetricOption = {
  name: 'metric',
  shorthand: null,
  type: String,
  argument: 'METRIC',
  deprecated: false,
  description:
    'Metric for the table view: requests, tokens, spend, imageCount, or videoCount (default: requests)',
} as const;

const leaderboardDateOption = {
  name: 'date',
  shorthand: null,
  type: String,
  argument: 'YYYY-MM-DD',
  deprecated: false,
  description: 'Day to show in the table view (default: most recent)',
} as const;

export const leaderboardModelsSubcommand = {
  name: 'models',
  aliases: [],
  description: 'Show the most-used models on AI Gateway',
  arguments: [],
  options: [
    leaderboardModalityOption,
    leaderboardMetricOption,
    leaderboardDateOption,
    leaderboardFormatOption,
    leaderboardOutOption,
  ],
  examples: [
    {
      name: 'Show the top text models',
      value: `${packageName} ai-gateway leaderboard models --modality text`,
    },
    {
      name: 'Export the full model data as CSV',
      value: `${packageName} ai-gateway leaderboard models --format csv --out models.csv`,
    },
  ],
} as const;

export const budgetsDefaultsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: "List the team's AI Gateway budget defaults",
  arguments: [],
  options: [formatOption],
  examples: [
    {
      name: 'List budget defaults',
      value: `${packageName} ai-gateway budgets defaults ls`,
    },
  ],
} as const;

export const budgetsDefaultsSetSubcommand = {
  name: 'set',
  aliases: [],
  description:
    'Create or update the AI Gateway budget default for a scope (project or api-key), applied to resources of that scope without an explicit budget',
  arguments: [{ name: 'scope', required: true }],
  options: [
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      argument: 'AMOUNT',
      deprecated: false,
      description: 'Default budget limit in dollars (minimum 1)',
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
    formatOption,
  ],
  examples: [
    {
      name: 'Set the per-project default',
      value: `${packageName} ai-gateway budgets defaults set project --limit 200 --refresh-period monthly`,
    },
    {
      name: 'Set the per-api-key default',
      value: `${packageName} ai-gateway budgets defaults set api-key --limit 50`,
    },
  ],
} as const;

export const budgetsDefaultsRemoveSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description:
    'Remove the AI Gateway budget default for a scope (project or api-key)',
  arguments: [{ name: 'scope', required: true }],
  options: [yesOption, formatOption],
  examples: [
    {
      name: 'Remove the per-project default',
      value: `${packageName} ai-gateway budgets defaults rm project`,
    },
  ],
} as const;

export const budgetsDefaultsSubcommand = {
  name: 'defaults',
  aliases: [],
  description:
    'Manage AI Gateway budget defaults (per-project and per-api-key spend limits applied by default)',
  arguments: [],
  subcommands: [
    budgetsDefaultsListSubcommand,
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

export const leaderboardLabsSubcommand = {
  name: 'labs',
  aliases: [],
  description: 'Show the most-used model creators (labs) on AI Gateway',
  arguments: [],
  options: [
    leaderboardModalityOption,
    leaderboardMetricOption,
    leaderboardDateOption,
    leaderboardFormatOption,
    leaderboardOutOption,
  ],
  examples: [
    {
      name: 'Show the top labs by spend',
      value: `${packageName} ai-gateway leaderboard labs --metric spend`,
    },
  ],
} as const;

export const leaderboardAppsSubcommand = {
  name: 'apps',
  aliases: [],
  description: 'Show the top apps built on AI Gateway',
  arguments: [],
  options: [leaderboardFormatOption, leaderboardOutOption],
  examples: [
    {
      name: 'Show the top apps',
      value: `${packageName} ai-gateway leaderboard apps`,
    },
  ],
} as const;

export const leaderboardProvidersSubcommand = {
  name: 'providers',
  aliases: [],
  description: 'Show the top inference providers on AI Gateway',
  arguments: [],
  options: [leaderboardFormatOption, leaderboardOutOption],
  examples: [
    {
      name: 'Show the top providers as JSON',
      value: `${packageName} ai-gateway leaderboard providers --format json`,
    },
  ],
} as const;

export const leaderboardSubcommand = {
  name: 'leaderboard',
  aliases: ['leaderboards'],
  description:
    'Explore AI Gateway usage leaderboards (open, anonymized data under CC BY 4.0)',
  arguments: [],
  subcommands: [
    leaderboardModelsSubcommand,
    leaderboardLabsSubcommand,
    leaderboardAppsSubcommand,
    leaderboardProvidersSubcommand,
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
    leaderboardSubcommand,
  ],
  options: [],
  examples: [],
} as const;
