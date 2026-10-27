import { packageName } from '../../util/pkg-name';
import {
  formatOption,
  jsonOption,
  limitOption,
  nextCursorOption,
  yesOption,
} from '../../util/arg-common';

const tokenPassOption = {
  name: 'token-pass',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description:
    "Scope the key to Vercel Token Pass: it spends only the team's Token Pass credits, on Token Pass models only. Cannot be changed after creation.",
} as const;

export const createSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create a new AI Gateway API key',
  arguments: [],
  options: [
    tokenPassOption,
    {
      name: 'name',
      shorthand: null,
      type: String,
      argument: 'NAME',
      deprecated: false,
      description: 'Human-readable name for the API key',
    },
    {
      name: 'amount',
      shorthand: null,
      type: Number,
      argument: 'USD',
      deprecated: false,
      description: 'Quota budget limit in dollars (minimum 1)',
    },
    // Hidden: `--limit` and `--budget` are the old names of `--amount`.
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      argument: 'AMOUNT',
      deprecated: true,
      description: 'Deprecated alias for `--amount`',
    },
    {
      name: 'budget',
      shorthand: null,
      type: Number,
      argument: 'AMOUNT',
      deprecated: true,
      description: 'Deprecated alias for `--amount`',
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
    {
      name: 'zdr-exempt',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        "Exempt the key from the team's ZDR-only model restriction (team owners only)",
    },
    {
      name: 'bypass-all-settings',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        "Exempt the key from all of the team's restrictions: ZDR-only models, the provider/model allowlist, and the HIPAA and prompt-training filters (team owners only)",
    },
  ],
  examples: [
    {
      name: 'Create an API key with defaults',
      value: `${packageName} ai-gateway api-keys create`,
    },
    {
      name: 'Create a key scoped to Vercel Token Pass',
      value: `${packageName} ai-gateway api-keys create --name token-pass --token-pass`,
    },
    {
      name: 'Create an API key with a budget',
      value: `${packageName} ai-gateway api-keys create --name my-key --amount 500 --refresh-period monthly`,
    },
    {
      name: 'Create a key that expires and alerts on spend',
      value: `${packageName} ai-gateway api-keys create --amount 500 --alert-thresholds 75,100 --expiration 90d`,
    },
    {
      name: 'Create a ZDR-exempt key (team owners only)',
      value: `${packageName} ai-gateway api-keys create --name escape-hatch --zdr-exempt --expiration 7d`,
    },
    {
      name: 'Create a key that bypasses all team restrictions (team owners only)',
      value: `${packageName} ai-gateway api-keys create --name escape-hatch --bypass-all-settings --expiration 7d`,
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List AI Gateway API keys',
  arguments: [],
  options: [
    {
      name: 'query',
      shorthand: 'q',
      type: String,
      argument: 'TEXT',
      deprecated: false,
      description:
        'Only keys whose name or key suffix contains this text (case-insensitive)',
    },
    {
      // Hidden alias; other list commands spell free-text search this way.
      name: 'search',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      deprecated: true,
      description: 'Alias for --query',
    },
    {
      name: 'creator',
      shorthand: null,
      type: String,
      argument: 'USER',
      deprecated: false,
      description:
        'Only keys created by this team member (email, username, or user id), or "me"; an unknown user id is used as-is',
    },
    {
      name: 'state',
      shorthand: null,
      type: String,
      argument: 'STATE',
      deprecated: false,
      description:
        'Which keys to list: active (unexpired), expired, deleted, or any (default: active)',
    },
    {
      name: 'sort',
      shorthand: null,
      type: String,
      argument: 'FIELD',
      deprecated: false,
      description:
        'Order by createdAt, lastActiveAt, name, or expiresAt, optionally with :asc or :desc (default: lastActiveAt:desc)',
    },
    limitOption,
    nextCursorOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'List API keys',
      value: `${packageName} ai-gateway api-keys list`,
    },
    {
      name: 'Find keys by name or suffix',
      value: `${packageName} ai-gateway api-keys list --query prod`,
    },
    {
      name: 'List your own unexpired keys, newest first',
      value: `${packageName} ai-gateway api-keys list --creator me --state active --sort createdAt`,
    },
    {
      name: 'Fetch the next 50 keys, using the cursor from pagination.next',
      placeholders: ['<CURSOR>'],
      value: `${packageName} ai-gateway api-keys list --limit 50 --next=<CURSOR> --json`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show details about an AI Gateway API key',
  arguments: [{ name: 'id', required: true }],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Inspect an API key',
      value: `${packageName} ai-gateway api-keys inspect key_123`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'revoke',
  aliases: ['remove', 'rm', 'delete'],
  description: 'Revoke an AI Gateway API key',
  arguments: [{ name: 'id', required: true }],
  options: [yesOption, formatOption, jsonOption],
  examples: [
    {
      name: 'Revoke an API key',
      value: `${packageName} ai-gateway api-keys revoke key_123`,
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
    limitOption,
    nextCursorOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'List routing rules',
      value: `${packageName} ai-gateway rules list`,
    },
    {
      name: 'Fetch the next 50 rules, using the cursor from pagination.next',
      placeholders: ['<CURSOR>'],
      value: `${packageName} ai-gateway rules list --limit 50 --next=<CURSOR> --json`,
    },
  ],
} as const;

export const rulesEditSubcommand = {
  name: 'update',
  aliases: ['edit'],
  description: 'Update an AI Gateway routing rule',
  arguments: [{ name: 'ruleId', required: true }],
  options: [
    {
      name: 'enable',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Turn the rule on',
    },
    {
      name: 'no-enable',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Turn the rule off',
    },
    {
      // Hidden: the old name of `--no-enable`.
      name: 'disable',
      shorthand: null,
      type: Boolean,
      deprecated: true,
      description: 'Deprecated alias for `--no-enable`',
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
      value: `${packageName} ai-gateway rules update rule_123 --no-enable`,
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
      value: `${packageName} ai-gateway rules remove rule_123`,
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
  description: 'Connect local coding agents to the AI Gateway',
  arguments: [],
  options: [
    tokenPassOption,
    {
      name: 'agent',
      shorthand: null,
      type: [String],
      argument: 'NAME',
      deprecated: false,
      description:
        'Coding agent to configure, repeatable; omit to pick from the detected agents',
    },
    {
      name: 'all',
      shorthand: 'a',
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
      name: 'amount',
      shorthand: null,
      type: Number,
      argument: 'USD',
      deprecated: false,
      description:
        'Quota budget in dollars for a newly created key (minimum 1)',
    },
    // Hidden: `--budget` is the old name of `--amount`.
    {
      name: 'budget',
      shorthand: null,
      type: Number,
      argument: 'AMOUNT',
      deprecated: true,
      description: 'Deprecated alias for `--amount`',
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
      name: 'no-session-migration',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Do not copy existing Codex Desktop sessions for use with the Vercel AI Gateway provider.',
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
        'How to apply non-interactively: edit (write files) or prompt (emit an agent prompt on stdout; requires the macOS Keychain) (default: edit)',
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
      value: `${packageName} ai-gateway setup`,
    },
    {
      name: 'Connect Claude Code with a Token Pass key',
      value: `${packageName} ai-gateway setup --token-pass --agent claude-code --yes`,
    },
    {
      name: 'Emit a prompt to hand to a coding agent instead of writing files',
      value: `${packageName} ai-gateway setup --apply prompt --yes`,
    },
    {
      name: 'Connect specific agents with a budgeted key',
      value: `${packageName} ai-gateway setup --agent claude-code --amount 500 --refresh-period monthly`,
    },
    {
      name: 'Rotate the key on an already-configured setup',
      value: `${packageName} ai-gateway setup --reconfigure`,
    },
    {
      name: 'Reuse an existing key and preview changes only',
      placeholders: ['<key>'],
      value: `${packageName} ai-gateway setup --key <key> --dry-run`,
    },
    {
      name: 'Point an agent at a different gateway base URL',
      value: `${packageName} ai-gateway setup --agent codex --base-url https://preview.ai-gateway.vercel.sh/v1`,
    },
  ],
} as const;

// The older spelling of `ai-gateway setup`, kept working but not listed.
export const codingAgentsSubcommand = {
  name: 'coding-agents',
  aliases: [],
  description: 'Connect local coding agents to the AI Gateway',
  hidden: true,
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
  options: [
    formatOption,
    jsonOption,
    {
      name: 'virtual',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: "Show only your team's virtual models",
    },
    {
      name: 'no-virtual',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Hide virtual models',
    },
  ],
  examples: [
    {
      name: 'List available models',
      value: `${packageName} ai-gateway models list`,
    },
    {
      name: "List only your team's virtual models",
      value: `${packageName} ai-gateway models list --virtual`,
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

const budgetDefaultOption = {
  name: 'default',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description:
    'Target the default budget for the scope, applied to resources of that scope without their own budget',
} as const;

export const budgetsSetSubcommand = {
  name: 'set',
  aliases: [],
  description:
    'Create or update an AI Gateway budget for a scope (team, project <name>, user <email>, or api-key <name>), or the default budget for a scope with --default',
  arguments: [
    { name: 'scope', required: true },
    { name: 'name', required: false },
  ],
  options: [
    {
      name: 'amount',
      shorthand: null,
      type: Number,
      argument: 'USD',
      deprecated: false,
      description: 'Budget limit in dollars (minimum 1)',
    },
    // Hidden: `--limit` is the old name of `--amount`.
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      argument: 'AMOUNT',
      deprecated: true,
      description: 'Deprecated alias for `--amount`',
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
    budgetDefaultOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Set a team budget',
      value: `${packageName} ai-gateway budgets set team --amount 500 --refresh-period monthly`,
    },
    {
      name: 'Set a project budget',
      value: `${packageName} ai-gateway budgets set project my-project --amount 200`,
    },
    {
      name: "Set a user's budget",
      value: `${packageName} ai-gateway budgets set user teammate@example.com --amount 100`,
    },
    {
      name: "Set an API key's budget",
      value: `${packageName} ai-gateway budgets set api-key my-key --amount 50`,
    },
    {
      name: 'Set the default budget for team members without their own',
      value: `${packageName} ai-gateway budgets set user --default --amount 50 --refresh-period monthly`,
    },
  ],
} as const;

export const budgetsInspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description:
    'Show one AI Gateway budget for a scope (team, project <name>, user <email>, or api-key <name>), or the default budget for a scope with --default',
  arguments: [
    { name: 'scope', required: true },
    { name: 'name', required: false },
  ],
  options: [budgetDefaultOption, formatOption, jsonOption],
  examples: [
    {
      name: "Inspect a user's budget",
      value: `${packageName} ai-gateway budgets inspect user teammate@example.com`,
    },
    {
      name: 'Inspect a project budget as JSON',
      value: `${packageName} ai-gateway budgets inspect project my-project --json`,
    },
    {
      name: 'Inspect the per-member default budget',
      value: `${packageName} ai-gateway budgets inspect user --default`,
    },
  ],
} as const;

export const budgetsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List AI Gateway budgets',
  arguments: [],
  options: [
    {
      name: 'scope-type',
      shorthand: null,
      type: String,
      argument: 'SCOPE',
      deprecated: false,
      description:
        'Only list budgets for one scope: team, project, user, or api-key',
    },
    {
      name: 'defaults',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        "List the team's default budgets instead of individual budgets",
    },
    limitOption,
    nextCursorOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'List budgets',
      value: `${packageName} ai-gateway budgets list`,
    },
    {
      name: 'List user budgets',
      value: `${packageName} ai-gateway budgets list --scope-type user`,
    },
    {
      name: 'List the default budgets',
      value: `${packageName} ai-gateway budgets list --defaults`,
    },
    {
      name: 'Fetch the next 50 budgets, using the cursor from pagination.next',
      placeholders: ['<CURSOR>'],
      value: `${packageName} ai-gateway budgets list --limit 50 --next=<CURSOR> --json`,
    },
  ],
} as const;

export const budgetsRemoveSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description:
    'Remove an AI Gateway budget for a scope (team, project <name>, user <email>, or api-key <name>), or the default budget for a scope with --default',
  arguments: [
    { name: 'scope', required: true },
    { name: 'name', required: false },
  ],
  options: [yesOption, budgetDefaultOption, formatOption, jsonOption],
  examples: [
    {
      name: 'Remove the team budget',
      value: `${packageName} ai-gateway budgets remove team`,
    },
    {
      name: 'Remove a project budget',
      value: `${packageName} ai-gateway budgets remove project my-project`,
    },
    {
      name: "Remove a user's budget",
      value: `${packageName} ai-gateway budgets remove user teammate@example.com`,
    },
    {
      name: "Remove an API key's budget",
      value: `${packageName} ai-gateway budgets remove api-key my-key`,
    },
    {
      name: 'Remove the default budget for API keys',
      value: `${packageName} ai-gateway budgets remove api-key --default`,
    },
  ],
} as const;

const leaderboardFormatOption = {
  name: 'format',
  shorthand: null,
  deprecatedShorthand: 'F',
  type: String,
  argument: 'FORMAT',
  deprecated: false,
  description:
    'Output format: table, json, or csv (default: table in a terminal, json otherwise)',
} as const;

const leaderboardOutputOption = {
  name: 'output',
  shorthand: 'o',
  type: String,
  argument: 'PATH',
  deprecated: false,
  description:
    'Write the payload to a file instead of stdout (default: json; use --format csv for CSV)',
} as const;

// Hidden: `--out` is the old name of `--output`.
const leaderboardOutOption = {
  name: 'out',
  shorthand: null,
  type: String,
  argument: 'FILE',
  deprecated: true,
  description: 'Deprecated alias for `--output`',
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
    leaderboardOutputOption,
    leaderboardOutOption,
  ],
  examples: [
    {
      name: 'Show the top text models',
      value: `${packageName} ai-gateway leaderboard models --modality text`,
    },
    {
      name: 'Export the full model data as CSV',
      value: `${packageName} ai-gateway leaderboard models --format csv --output models.csv`,
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
      value: `${packageName} ai-gateway budgets defaults list`,
    },
  ],
} as const;

export const budgetsDefaultsSetSubcommand = {
  name: 'set',
  aliases: [],
  description:
    'Create or update the AI Gateway budget default for a scope (project, api-key, or user), applied to resources of that scope without an explicit budget',
  arguments: [{ name: 'scope', required: true }],
  options: [
    {
      name: 'amount',
      shorthand: null,
      type: Number,
      argument: 'USD',
      deprecated: false,
      description: 'Default budget limit in dollars (minimum 1)',
    },
    // Hidden: `--limit` is the old name of `--amount`.
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      argument: 'AMOUNT',
      deprecated: true,
      description: 'Deprecated alias for `--amount`',
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
      value: `${packageName} ai-gateway budgets defaults set project --amount 200 --refresh-period monthly`,
    },
    {
      name: 'Set the per-api-key default',
      value: `${packageName} ai-gateway budgets defaults set api-key --amount 50`,
    },
    {
      name: 'Set the per-member default',
      value: `${packageName} ai-gateway budgets defaults set user --amount 50`,
    },
  ],
} as const;

export const budgetsDefaultsRemoveSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description:
    'Remove the AI Gateway budget default for a scope (project, api-key, or user)',
  arguments: [{ name: 'scope', required: true }],
  options: [yesOption, formatOption],
  examples: [
    {
      name: 'Remove the per-project default',
      value: `${packageName} ai-gateway budgets defaults remove project`,
    },
  ],
} as const;

export const budgetsDefaultsSubcommand = {
  name: 'defaults',
  aliases: [],
  // Deprecated: kept routable, hidden from help. `--default` on budgets
  // set|inspect|remove and `budgets ls --defaults` replace it.
  hidden: true,
  description:
    'Manage AI Gateway budget defaults (per-project, per-api-key, and per-member spend limits applied by default)',
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
    budgetsInspectSubcommand,
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
    leaderboardOutputOption,
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
  options: [
    leaderboardFormatOption,
    leaderboardOutputOption,
    leaderboardOutOption,
  ],
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
  options: [
    leaderboardFormatOption,
    leaderboardOutputOption,
    leaderboardOutOption,
  ],
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

export const virtualModelsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List AI Gateway virtual models',
  arguments: [],
  options: [
    {
      name: 'include-archived',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Include archived virtual models',
    },
    limitOption,
    nextCursorOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'List virtual models',
      value: `${packageName} ai-gateway virtual-models list`,
    },
    {
      name: 'Fetch the next 50 virtual models, using the cursor from pagination.next',
      placeholders: ['<CURSOR>'],
      value: `${packageName} ai-gateway virtual-models list --limit 50 --next=<CURSOR> --json`,
    },
  ],
} as const;

export const virtualModelsInspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show details about an AI Gateway virtual model',
  arguments: [{ name: 'slug', required: true }],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Inspect a virtual model',
      value: `${packageName} ai-gateway virtual-models inspect my-model`,
    },
  ],
} as const;

const virtualModelConfigOption = {
  name: 'config',
  shorthand: null,
  type: String,
  argument: 'JSON',
  deprecated: false,
  description:
    'JSON object of virtual model fields, for anything without a dedicated option. Options win over keys set here',
} as const;

const virtualModelFieldOptions = [
  {
    name: 'model',
    shorthand: null,
    type: String,
    argument: 'SLUG',
    deprecated: false,
    description: 'Model the virtual model points at (e.g. openai/gpt-5.1)',
  },
  {
    name: 'display-name',
    shorthand: null,
    type: String,
    argument: 'NAME',
    deprecated: false,
    description: 'Human-readable name shown in the dashboard',
  },
  {
    name: 'description',
    shorthand: null,
    type: String,
    argument: 'TEXT',
    deprecated: false,
    description: 'Description of the virtual model',
  },
  {
    name: 'provider-order',
    shorthand: null,
    type: String,
    argument: 'LIST',
    deprecated: false,
    description: 'Comma-separated providers to try, in order',
  },
  {
    name: 'provider-only',
    shorthand: null,
    type: String,
    argument: 'LIST',
    deprecated: false,
    description: 'Comma-separated providers to restrict routing to',
  },
] as const;

export const virtualModelsCreateSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create an AI Gateway virtual model',
  arguments: [{ name: 'slug', required: false }],
  options: [
    {
      name: 'kind',
      shorthand: null,
      type: String,
      argument: 'KIND',
      deprecated: false,
      description: 'Virtual model kind: alias or relay (default: alias)',
    },
    ...virtualModelFieldOptions,
    virtualModelConfigOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Create a virtual model interactively',
      value: `${packageName} ai-gateway virtual-models create`,
    },
    {
      name: 'Create a virtual model in one line',
      value: `${packageName} ai-gateway virtual-models create my-model --model openai/gpt-5.1`,
    },
    {
      name: 'Create a virtual model with fields that have no option',
      value: `${packageName} ai-gateway virtual-models create my-model --model openai/gpt-5.1 --config '{"sort":"cost","zeroDataRetention":true}'`,
    },
  ],
} as const;

export const virtualModelsEditSubcommand = {
  name: 'update',
  aliases: ['edit'],
  description: 'Update an AI Gateway virtual model',
  arguments: [{ name: 'slug', required: true }],
  options: [
    ...virtualModelFieldOptions,
    virtualModelConfigOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Point a virtual model at a different model',
      value: `${packageName} ai-gateway virtual-models update my-model --model anthropic/claude-sonnet-4.5`,
    },
  ],
} as const;

export const virtualModelsRemoveSubcommand = {
  name: 'delete',
  aliases: ['rm', 'del', 'remove'],
  description: 'Delete an AI Gateway virtual model',
  arguments: [{ name: 'slug', required: true }],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Delete a virtual model',
      value: `${packageName} ai-gateway virtual-models delete my-model`,
    },
  ],
} as const;

export const virtualModelsRestoreSubcommand = {
  name: 'restore',
  aliases: [],
  description: 'Restore a deleted AI Gateway virtual model',
  arguments: [{ name: 'slug', required: true }],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Restore a deleted virtual model',
      value: `${packageName} ai-gateway virtual-models restore my-model`,
    },
  ],
} as const;

export const virtualModelsSubcommand = {
  name: 'virtual-models',
  aliases: [],
  description:
    'Manage AI Gateway virtual models, reusable model configurations callable as vmc/<slug>',
  arguments: [],
  subcommands: [
    virtualModelsCreateSubcommand,
    virtualModelsListSubcommand,
    virtualModelsInspectSubcommand,
    virtualModelsEditSubcommand,
    virtualModelsRemoveSubcommand,
    virtualModelsRestoreSubcommand,
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
    virtualModelsSubcommand,
    setupSubcommand,
    codingAgentsSubcommand,
    modelsSubcommand,
    leaderboardSubcommand,
  ],
  options: [],
  examples: [],
} as const;
