import { packageName } from '../../util/pkg-name';
import {
  limitOption,
  projectOption,
  sinceOption,
  untilOption,
  yesOption,
} from '../../util/arg-common';

export const teamLevelOption = {
  name: 'team-level',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description:
    'Operate on the team-level firewall configuration, which applies to every project in the team. No linked project required. Cannot be combined with --project',
} as const;

export const overviewSubcommand = {
  name: 'overview',
  aliases: [],
  description:
    "Show your project's firewall configuration with the last day of activity: traffic by action, the busiest rules, and alerts raised in the same window",
  arguments: [],
  options: [
    projectOption,
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'Show firewall configuration and recent activity',
      value: `${packageName} firewall overview`,
    },
    {
      name: 'Report the same data as JSON',
      value: `${packageName} firewall overview --json`,
    },
  ],
} as const;

export const statusSubcommand = {
  name: 'status',
  aliases: [],
  description:
    'Show firewall configuration in execution order, including managed rulesets and bypass paths',
  arguments: [],
  options: [
    projectOption,
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'Show firewall status',
      value: `${packageName} firewall status`,
    },
  ],
} as const;

export const diffSubcommand = {
  name: 'diff',
  aliases: [],
  description:
    'Show draft changes that have been made but are not yet published to production',
  arguments: [],
  options: [
    projectOption,
    teamLevelOption,
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'Show unpublished changes',
      value: `${packageName} firewall diff`,
    },
    {
      name: 'Show unpublished team-level changes',
      value: `${packageName} firewall diff --team-level`,
    },
  ],
} as const;

export const publishSubcommand = {
  descriptionTone: 'normal',
  name: 'publish',
  aliases: [],
  description:
    'Publish all draft firewall changes to production, making them live immediately',
  arguments: [],
  options: [projectOption, teamLevelOption, yesOption],
  examples: [
    {
      name: 'Publish draft changes',
      value: `${packageName} firewall publish`,
    },
    {
      name: 'Publish without confirmation',
      value: `${packageName} firewall publish --yes`,
    },
    {
      name: 'Publish team-level draft changes',
      value: `${packageName} firewall publish --team-level`,
    },
  ],
} as const;

export const discardSubcommand = {
  descriptionTone: 'normal',
  name: 'discard',
  aliases: [],
  description:
    'Permanently discard all unpublished draft changes, reverting to the current production configuration',
  arguments: [],
  options: [projectOption, teamLevelOption, yesOption],
  examples: [
    {
      name: 'Discard draft changes',
      value: `${packageName} firewall discard`,
    },
    {
      name: 'Discard without confirmation',
      value: `${packageName} firewall discard --yes`,
    },
  ],
} as const;

// System Bypass subcommands
export const systemBypassListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List all system bypass rules that allow specific IPs to skip firewall checks',
  arguments: [],
  options: [
    projectOption,
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'List bypass rules',
      value: `${packageName} firewall system-bypass list`,
    },
  ],
} as const;

export const systemBypassAddSubcommand = {
  descriptionTone: 'normal',
  name: 'add',
  aliases: [],
  description:
    'Add a system bypass rule to allow a specific IP address to skip firewall checks. Takes effect immediately (no publish required)',
  arguments: [{ name: 'ip', required: true }],
  options: [
    projectOption,
    {
      name: 'domain',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Scope bypass to a specific domain (default: all domains)',
    },
    {
      name: 'notes',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Add a note to the bypass rule',
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Add a bypass for an IP (all domains)',
      value: `${packageName} firewall system-bypass add 10.0.0.1`,
    },
    {
      name: 'Add a bypass scoped to a domain',
      value: `${packageName} firewall system-bypass add 10.0.0.1 --domain example.com`,
    },
  ],
} as const;

export const systemBypassRemoveSubcommand = {
  descriptionTone: 'normal',
  name: 'remove',
  aliases: ['rm'],
  description:
    'Remove a system bypass rule so the IP is no longer exempt from firewall checks. Takes effect immediately (no publish required)',
  arguments: [{ name: 'ip', required: true }],
  options: [
    projectOption,
    {
      name: 'domain',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Scope removal to a specific domain',
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Remove a bypass rule',
      value: `${packageName} firewall system-bypass remove 10.0.0.1`,
    },
  ],
} as const;

export const systemBypassSubcommand = {
  name: 'system-bypass',
  aliases: [],
  description:
    'Manage system bypass rules that allow specific IPs to skip firewall checks',
  arguments: [],
  subcommands: [
    systemBypassListSubcommand,
    systemBypassAddSubcommand,
    systemBypassRemoveSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List bypass rules',
      value: `${packageName} firewall system-bypass list`,
    },
    {
      name: 'Add a bypass for an IP',
      value: `${packageName} firewall system-bypass add 10.0.0.1`,
    },
    {
      name: 'Remove a bypass',
      value: `${packageName} firewall system-bypass remove 10.0.0.1`,
    },
  ],
} as const;

// IP Blocks subcommands
export const ipBlocksListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List all IP blocking rules, including any unpublished draft changes',
  arguments: [],
  options: [
    projectOption,
    teamLevelOption,
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'List IP blocking rules',
      value: `${packageName} firewall ip-blocks list`,
    },
  ],
} as const;

export const ipBlocksBlockSubcommand = {
  name: 'block',
  aliases: [],
  description:
    'Block an IP address or CIDR range from accessing your project. Stages a draft change — run `publish` to make it live',
  arguments: [{ name: 'ip', required: true }],
  options: [
    projectOption,
    teamLevelOption,
    {
      name: 'hostname',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Scope block to a specific hostname (default: * for all hosts)',
    },
    {
      name: 'notes',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Add a note to the block rule',
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Block an IP',
      value: `${packageName} firewall ip-blocks block 1.2.3.4`,
    },
    {
      name: 'Block a CIDR range with a note',
      value: `${packageName} firewall ip-blocks block 10.0.0.0/24 --notes "Suspicious range"`,
    },
    {
      name: 'Block scoped to a hostname',
      value: `${packageName} firewall ip-blocks block 1.2.3.4 --hostname example.com`,
    },
  ],
} as const;

export const ipBlocksUnblockSubcommand = {
  name: 'unblock',
  aliases: ['rm'],
  description:
    'Remove an IP blocking rule to allow the address to access your project again. Stages a draft change — run `publish` to make it live',
  arguments: [{ name: 'id-or-ip', required: true }],
  options: [
    projectOption,
    teamLevelOption,
    {
      name: 'hostname',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Narrow match to a specific hostname (useful when the same IP is blocked on multiple hosts)',
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Unblock by IP',
      value: `${packageName} firewall ip-blocks unblock 1.2.3.4`,
    },
    {
      name: 'Unblock scoped to a hostname',
      value: `${packageName} firewall ip-blocks unblock 1.2.3.4 --hostname example.com`,
    },
    {
      name: 'Unblock by rule ID',
      value: `${packageName} firewall ip-blocks unblock ip_abc123`,
    },
  ],
} as const;

export const ipBlocksSubcommand = {
  name: 'ip-blocks',
  aliases: [],
  description:
    'Manage IP blocking rules that deny access from specific addresses or ranges',
  arguments: [],
  subcommands: [
    ipBlocksListSubcommand,
    ipBlocksBlockSubcommand,
    ipBlocksUnblockSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List IP blocking rules',
      value: `${packageName} firewall ip-blocks list`,
    },
    {
      name: 'Block an IP',
      value: `${packageName} firewall ip-blocks block 1.2.3.4`,
    },
    {
      name: 'Unblock an IP',
      value: `${packageName} firewall ip-blocks unblock 1.2.3.4`,
    },
  ],
} as const;

// Attack Mode subcommands

// Rules subcommands
export const rulesListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List managed bot rules and custom firewall rules, including unpublished draft changes',
  arguments: [],
  options: [
    projectOption,
    teamLevelOption,
    {
      name: 'expand',
      shorthand: null,
      deprecatedShorthand: 'e',
      type: Boolean,
      deprecated: false,
      description: 'Show full condition details for each rule',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'List rules',
      value: `${packageName} firewall rules list`,
    },
    {
      name: 'List rules with full condition details',
      value: `${packageName} firewall rules list --expand`,
    },
    {
      name: 'List team-level rules',
      value: `${packageName} firewall rules list --team-level`,
    },
  ],
} as const;

export const rulesInspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description:
    'Show a custom or managed bot rule, including conditions, action, and rate limit settings',
  arguments: [{ name: 'name-or-id', required: true }],
  options: [
    projectOption,
    teamLevelOption,
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'Inspect a rule by name',
      value: `${packageName} firewall rules inspect "Block bots"`,
    },
    {
      name: 'Inspect a rule by ID',
      value: `${packageName} firewall rules inspect rule_abc123`,
    },
    {
      name: 'Inspect a managed bot rule',
      value: `${packageName} firewall rules inspect bot-protection`,
    },
  ],
} as const;

export const rulesAddSubcommand = {
  name: 'add',
  aliases: [],
  description:
    'Create a new custom firewall rule using AI, an interactive builder, JSON, or command-line options. Stages a draft change — run `publish` to make it live',
  arguments: [{ name: 'name', required: false }],
  options: [
    projectOption,
    teamLevelOption,
    {
      name: 'ai',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Generate rule from natural language (AI-powered)',
    },
    {
      name: 'data',
      shorthand: null,
      type: String,
      argument: 'JSON',
      deprecated: false,
      description: 'Create rule from a JSON payload',
    },
    // Hidden: the old name for --data. `--json` is the output flag elsewhere.
    {
      name: 'json',
      shorthand: null,
      type: String,
      deprecated: true,
    },
    {
      name: 'condition',
      shorthand: null,
      type: [String] as unknown as StringConstructor,
      deprecated: false,
      description:
        'Condition as JSON (repeatable). Multiple conditions are AND\'d together. Fields: type (required), op (required), value, key (for header/cookie/query), neg (boolean). Example: \'{"type":"path","op":"pre","value":"/api"}\'.',
    },
    {
      name: 'or',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        "Start a new OR group. Conditions before --or are AND'd, conditions after form a separate group. Example: --condition A --condition B --or --condition C matches (A AND B) OR C.",
    },
    {
      name: 'action',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Action: deny, challenge, log, bypass, rate_limit, redirect',
    },
    {
      name: 'duration',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Action duration: 1m, 5m, 15m, 30m, 1h',
    },
    {
      name: 'description',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Rule description (max 256 chars)',
    },
    {
      name: 'no-enable',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Add the rule turned off (default: on)',
    },
    {
      // Hidden: the old name of `--no-enable`.
      name: 'disabled',
      shorthand: null,
      type: Boolean,
      deprecated: true,
      description: 'Deprecated alias for `--no-enable`',
    },
    {
      name: 'rate-limit-algo',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Rate limit algorithm: fixed_window, token_bucket (default: fixed_window)',
    },
    {
      name: 'rate-limit-window',
      shorthand: null,
      type: Number,
      deprecated: false,
      description:
        'Rate limit window in seconds, 10-3600 (required for rate_limit)',
    },
    {
      name: 'rate-limit-requests',
      shorthand: null,
      type: Number,
      deprecated: false,
      description:
        'Rate limit max requests per window, 1-10000000 (required for rate_limit)',
    },
    {
      name: 'rate-limit-keys',
      shorthand: null,
      type: [String] as unknown as StringConstructor,
      deprecated: false,
      description:
        'Rate limit keys (repeatable): ip, ja4, header:name (default: ip)',
    },
    {
      name: 'rate-limit-action',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Action when rate limit is exceeded: log, deny, challenge, rate_limit (default: rate_limit)',
    },
    {
      name: 'redirect-url',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Redirect URL or path',
    },
    {
      name: 'redirect-permanent',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Permanent redirect (301) (default: temporary, 307)',
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Interactive mode',
      value: `${packageName} firewall rules add`,
    },
    {
      name: 'Create with AI',
      value: `${packageName} firewall rules add --ai "Rate limit /api to 100 requests per minute by IP"`,
    },
    {
      name: 'Create from JSON',
      value: `${packageName} firewall rules add --data '{"name":"Block bots","active":true,"conditionGroup":[{"conditions":[{"type":"user_agent","op":"sub","value":"crawler"}]}],"action":{"mitigate":{"action":"deny"}}}'`,
    },
    {
      name: 'Create with options',
      value: `${packageName} firewall rules add "Block bots" --condition '{"type":"user_agent","op":"sub","value":"crawler"}' --action deny --yes`,
    },
    {
      name: 'Create with OR groups',
      value: `${packageName} firewall rules add "Block suspicious" --condition '{"type":"user_agent","op":"sub","value":"crawler"}' --or --condition '{"type":"ip_address","op":"eq","value":"1.2.3.4"}' --action deny --yes`,
    },
  ],
} as const;

export const rulesEditSubcommand = {
  name: 'update',
  aliases: ['edit'],
  description:
    'Update a custom rule or a managed bot rule action using AI, an interactive editor, JSON, or command-line options. Stages a draft change — run `publish` to make it live',
  arguments: [{ name: 'name-or-id', required: true }],
  options: [
    projectOption,
    teamLevelOption,
    {
      name: 'ai',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Describe changes using natural language (AI-powered)',
    },
    {
      name: 'data',
      shorthand: null,
      type: String,
      argument: 'JSON',
      deprecated: false,
      description: 'Replace rule with a JSON payload',
    },
    // Hidden: the old name for --data. `--json` is the output flag elsewhere.
    {
      name: 'json',
      shorthand: null,
      type: String,
      deprecated: true,
    },
    {
      name: 'condition',
      shorthand: null,
      type: [String] as unknown as StringConstructor,
      deprecated: false,
      description:
        'Replace conditions as JSON (repeatable). Example: \'{"type":"path","op":"pre","value":"/api"}\'. Fields: type, op, value, key (for header/cookie/query), neg (boolean). Use --or between conditions for OR groups.',
    },
    {
      name: 'or',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Start a new OR condition group',
    },
    {
      name: 'name',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Rename the rule',
    },
    {
      name: 'action',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Change action: deny, challenge, log, bypass, rate_limit, redirect',
    },
    {
      name: 'duration',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Change action duration: 1m, 5m, 15m, 30m, 1h',
    },
    {
      name: 'description',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Change description (use "" to clear)',
    },
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
      // Hidden: the old name of `--enable`.
      name: 'enabled',
      shorthand: null,
      type: Boolean,
      deprecated: true,
      description: 'Deprecated alias for `--enable`',
    },
    {
      // Hidden: the old name of `--no-enable`.
      name: 'disabled',
      shorthand: null,
      type: Boolean,
      deprecated: true,
      description: 'Deprecated alias for `--no-enable`',
    },
    {
      name: 'rate-limit-algo',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Rate limit algorithm: fixed_window, token_bucket',
    },
    {
      name: 'rate-limit-window',
      shorthand: null,
      type: Number,
      deprecated: false,
      description: 'Rate limit window in seconds (10-3600)',
    },
    {
      name: 'rate-limit-requests',
      shorthand: null,
      type: Number,
      deprecated: false,
      description: 'Rate limit max requests per window (1-10000000)',
    },
    {
      name: 'rate-limit-keys',
      shorthand: null,
      type: [String] as unknown as StringConstructor,
      deprecated: false,
      description: 'Rate limit keys (repeatable): ip, ja4, header:name',
    },
    {
      name: 'rate-limit-action',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Action when rate limit is exceeded: log, deny, challenge, rate_limit (default: rate_limit)',
    },
    {
      name: 'redirect-url',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Redirect URL or path',
    },
    {
      name: 'redirect-permanent',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Permanent redirect (301) (default: temporary, 307)',
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Interactive mode',
      value: `${packageName} firewall rules update "My Rule"`,
    },
    {
      name: 'Update with AI',
      value: `${packageName} firewall rules update "My Rule" --ai "Change action to challenge"`,
    },
    {
      name: 'Change action via options',
      value: `${packageName} firewall rules update "My Rule" --action challenge --duration 5m --yes`,
    },
    {
      name: 'Replace conditions',
      value: `${packageName} firewall rules update "My Rule" --condition '{"type":"path","op":"pre","value":"/new"}' --yes`,
    },
    {
      name: 'Rename a rule',
      value: `${packageName} firewall rules update "My Rule" --name "New Name" --yes`,
    },
    {
      name: 'Change a managed bot rule action',
      value: `${packageName} firewall rules update ai-bots --action deny --yes`,
    },
  ],
} as const;

export const rulesEnableSubcommand = {
  name: 'enable',
  aliases: [],
  description:
    'Enable a disabled custom firewall rule. Stages a draft change — run `publish` to make it live',
  arguments: [{ name: 'name-or-id', required: true }],
  options: [projectOption, teamLevelOption, yesOption],
  examples: [
    {
      name: 'Enable a rule',
      value: `${packageName} firewall rules enable "My Rule"`,
    },
  ],
} as const;

export const rulesDisableSubcommand = {
  descriptionTone: 'normal',
  name: 'disable',
  aliases: [],
  description:
    'Disable a custom firewall rule without removing it. Stages a draft change — run `publish` to make it live',
  arguments: [{ name: 'name-or-id', required: true }],
  options: [projectOption, teamLevelOption, yesOption],
  examples: [
    {
      name: 'Disable a rule',
      value: `${packageName} firewall rules disable "My Rule"`,
    },
  ],
} as const;

export const rulesRemoveSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description:
    'Remove a custom firewall rule. Stages a draft change — run `publish` to make it live',
  arguments: [{ name: 'name-or-id', required: true }],
  options: [projectOption, teamLevelOption, yesOption],
  examples: [
    {
      name: 'Remove a rule',
      value: `${packageName} firewall rules remove "My Rule" --yes`,
    },
  ],
} as const;

export const rulesReorderSubcommand = {
  name: 'move',
  aliases: ['reorder'],
  description:
    'Change the priority order of a custom firewall rule. Stages a draft change — run `publish` to make it live',
  arguments: [{ name: 'name-or-id', required: true }],
  options: [
    projectOption,
    teamLevelOption,
    {
      name: 'position',
      shorthand: null,
      type: Number,
      deprecated: false,
      description: 'Target position (1-based)',
    },
    {
      name: 'first',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Move to first position',
    },
    {
      name: 'last',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Move to last position',
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Move to first position',
      value: `${packageName} firewall rules move "My Rule" --first --yes`,
    },
    {
      name: 'Move to position 3',
      value: `${packageName} firewall rules move "My Rule" --position 3 --yes`,
    },
  ],
} as const;

export const rulesSubcommand = {
  name: 'rules',
  aliases: [],
  description:
    'Manage custom firewall rules that control how traffic is handled based on conditions',
  arguments: [],
  subcommands: [
    rulesListSubcommand,
    rulesInspectSubcommand,
    rulesAddSubcommand,
    rulesEditSubcommand,
    rulesEnableSubcommand,
    rulesDisableSubcommand,
    rulesRemoveSubcommand,
    rulesReorderSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List rules',
      value: `${packageName} firewall rules list`,
    },
    {
      name: 'Inspect a rule',
      value: `${packageName} firewall rules inspect "Block bots"`,
    },
    {
      name: 'Create with AI',
      value: `${packageName} firewall rules add --ai "Rate limit /api to 100 requests per minute by IP"`,
    },
    {
      name: 'Update with AI',
      value: `${packageName} firewall rules update "My Rule" --ai "Change action to challenge"`,
    },
  ],
} as const;

export const attackModeEnableSubcommand = {
  descriptionTone: 'normal',
  name: 'enable',
  aliases: [],
  description:
    'Enable attack mode — all visitors will be shown a verification challenge before accessing your site. Takes effect immediately (no publish required)',
  arguments: [],
  options: [
    projectOption,
    {
      name: 'duration',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Duration: 1h, 6h, or 24h (default: 1h)',
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Enable attack mode for 1 hour',
      value: `${packageName} firewall attack-mode enable`,
    },
    {
      name: 'Enable attack mode for 24 hours',
      value: `${packageName} firewall attack-mode enable --duration 24h`,
    },
  ],
} as const;

export const attackModeDisableSubcommand = {
  descriptionTone: 'normal',
  name: 'disable',
  aliases: [],
  description:
    'Disable attack mode — visitors will no longer be challenged. Takes effect immediately (no publish required)',
  arguments: [],
  options: [projectOption, yesOption],
  examples: [
    {
      name: 'Disable attack mode',
      value: `${packageName} firewall attack-mode disable`,
    },
  ],
} as const;

export const attackModeSubcommand = {
  name: 'attack-mode',
  aliases: [],
  description:
    'Manage attack mode, which challenges all incoming requests with a verification page',
  arguments: [],
  subcommands: [attackModeEnableSubcommand, attackModeDisableSubcommand],
  options: [],
  examples: [
    {
      name: 'Enable attack mode',
      value: `${packageName} firewall attack-mode enable`,
    },
    {
      name: 'Disable attack mode',
      value: `${packageName} firewall attack-mode disable`,
    },
  ],
} as const;

// System Mitigations subcommands
export const systemMitigationsPauseSubcommand = {
  descriptionTone: 'normal',
  name: 'pause',
  aliases: [],
  description:
    'Pause automatic DDoS protection and system-level traffic filtering for 24 hours. Takes effect immediately (no publish required)',
  arguments: [],
  options: [projectOption, yesOption],
  examples: [
    {
      name: 'Pause system mitigations',
      value: `${packageName} firewall system-mitigations pause`,
    },
  ],
} as const;

export const systemMitigationsResumeSubcommand = {
  descriptionTone: 'normal',
  name: 'resume',
  aliases: [],
  description:
    'Resume automatic DDoS protection and system-level traffic filtering. Takes effect immediately (no publish required)',
  arguments: [],
  options: [projectOption, yesOption],
  examples: [
    {
      name: 'Resume system mitigations',
      value: `${packageName} firewall system-mitigations resume`,
    },
  ],
} as const;

export const systemMitigationsSubcommand = {
  name: 'system-mitigations',
  aliases: [],
  description:
    'Manage automatic DDoS protection and system-level traffic filtering',
  arguments: [],
  subcommands: [
    systemMitigationsPauseSubcommand,
    systemMitigationsResumeSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Pause system mitigations',
      value: `${packageName} firewall system-mitigations pause`,
    },
  ],
} as const;

const jsonOutputOption = {
  name: 'json',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description: 'Output as JSON',
} as const;

export const alertsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List active and resolved firewall alerts for the linked project',
  arguments: [],
  options: [
    projectOption,
    jsonOutputOption,
    {
      ...sinceOption,
      description: `${sinceOption.description} (default: 24h ago)`,
    },
    untilOption,
  ],
  examples: [
    {
      name: 'List alerts from the last day',
      value: `${packageName} firewall alerts list`,
    },
    {
      name: 'List alerts from the last week',
      value: `${packageName} firewall alerts list --since 7d`,
    },
  ],
} as const;

export const alertsInspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description:
    'Show one firewall alert: window, request rate, denied IPs, and top hosts',
  arguments: [{ name: 'alertid', required: true }],
  options: [projectOption, jsonOutputOption],
  examples: [
    {
      name: 'Inspect an alert',
      value: `${packageName} firewall alerts inspect al_abc123`,
    },
  ],
} as const;

export const alertsSubcommand = {
  name: 'alerts',
  aliases: [],
  description:
    'List and inspect firewall alerts, including DDoS mitigation episodes',
  arguments: [],
  subcommands: [alertsListSubcommand, alertsInspectSubcommand],
  options: [],
  examples: [
    {
      name: 'List alerts',
      value: `${packageName} firewall alerts list`,
    },
    {
      name: 'Inspect an alert',
      value: `${packageName} firewall alerts inspect al_abc123`,
    },
  ],
} as const;

export const persistentActionsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List persistent firewall actions for the linked project (default: last hour)',
  arguments: [],
  options: [
    projectOption,
    jsonOutputOption,
    {
      ...sinceOption,
      description: `${sinceOption.description} (default: 1h ago)`,
    },
    untilOption,
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      argument: 'NUMBER',
      deprecated: false,
      description: 'Number of actions to show (default: 10)',
    },
  ],
  examples: [
    {
      name: 'List persistent actions from the last hour',
      value: `${packageName} firewall persistent-actions list`,
    },
    {
      name: 'List persistent actions from the last six hours',
      value: `${packageName} firewall persistent-actions list --since 6h`,
    },
  ],
} as const;

export const persistentActionsInspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description:
    'Show one persistent firewall action: window and requests by action',
  arguments: [{ name: 'ip', required: true }],
  options: [
    projectOption,
    jsonOutputOption,
    {
      name: 'host',
      shorthand: null,
      type: String,
      argument: 'HOSTNAME',
      deprecated: false,
      description: 'Narrow to a hostname',
    },
    {
      name: 'action',
      shorthand: null,
      type: String,
      argument: 'ACTION',
      deprecated: false,
      description: 'Narrow to an action (challenge, deny, log, …)',
    },
    {
      ...sinceOption,
      description: `${sinceOption.description} (default: 1h ago)`,
    },
    untilOption,
    {
      name: 'paths',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Include the top request paths',
    },
  ],
  examples: [
    {
      name: 'Inspect a persistent action by IP',
      value: `${packageName} firewall persistent-actions inspect 51.158.168.18 --host vercel.com --action challenge`,
    },
    {
      name: 'Include the paths the client requested',
      value: `${packageName} firewall persistent-actions inspect 51.158.168.18 --paths`,
    },
  ],
} as const;

export const persistentActionsSubcommand = {
  name: 'persistent-actions',
  aliases: [],
  description:
    'List and inspect persistent firewall actions taken against specific clients',
  arguments: [],
  subcommands: [
    persistentActionsListSubcommand,
    persistentActionsInspectSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List persistent actions',
      value: `${packageName} firewall persistent-actions list`,
    },
    {
      name: 'Inspect a persistent action',
      value: `${packageName} firewall persistent-actions inspect 51.158.168.18 --host vercel.com --action challenge`,
    },
  ],
} as const;

/**
 * Dimension filters, mirroring the traffic page's filter bar. `--query`
 * covers anything not spelled out here, but a flag per dimension keeps the
 * common cases free of OData.
 */
const trafficIpOption = {
  name: 'ip',
  shorthand: null,
  type: String,
  argument: 'IP',
  deprecated: false,
  description: 'Narrow to one client IP',
} as const;

const trafficJa4Option = {
  name: 'ja4',
  shorthand: null,
  type: String,
  argument: 'DIGEST',
  deprecated: false,
  description: 'Narrow to one JA4 TLS fingerprint',
} as const;

const trafficAsnOption = {
  name: 'asn',
  shorthand: null,
  type: String,
  argument: 'NAME',
  deprecated: false,
  description: 'Narrow to one autonomous system name',
} as const;

const trafficUserAgentOption = {
  name: 'user-agent',
  shorthand: null,
  type: String,
  argument: 'UA',
  deprecated: false,
  description: 'Narrow to one user agent',
} as const;

const trafficPathOption = {
  name: 'path',
  shorthand: null,
  type: String,
  argument: 'PATH',
  deprecated: false,
  description: 'Narrow to one request path',
} as const;

const trafficRuleOption = {
  name: 'rule',
  shorthand: null,
  type: String,
  argument: 'RULE_ID',
  deprecated: false,
  description: 'Narrow to one firewall rule id',
} as const;

const trafficHostOption = {
  name: 'host',
  shorthand: null,
  type: String,
  argument: 'HOSTNAME',
  deprecated: false,
  description: 'Narrow to one hostname',
} as const;

const trafficBotOption = {
  name: 'bot',
  shorthand: null,
  type: String,
  argument: 'BOT',
  deprecated: false,
  description: 'Narrow to one verified bot',
} as const;

const trafficUnknownBotOption = {
  name: 'unknown-bot',
  shorthand: null,
  type: String,
  argument: 'CATEGORY',
  deprecated: false,
  description: 'Narrow inspect unknown-bot to one category',
} as const;

const trafficCountryOption = {
  name: 'country',
  shorthand: null,
  type: String,
  argument: 'CODE',
  deprecated: false,
  description: 'Narrow to one country code',
} as const;

const trafficActionOption = {
  name: 'action',
  shorthand: null,
  type: String,
  argument: 'ACTION',
  deprecated: false,
  description: 'Narrow to one firewall action (deny, challenge, log, …)',
} as const;

const trafficQueryOption = {
  name: 'query',
  shorthand: 'q',
  type: [String],
  argument: 'TEXT',
  deprecated: false,
  // KQL, not OData: these commands always query the canonical observability
  // path — they do not read `FF_LEGACY_METRICS` the way `vercel metrics`
  // does — and an OData expression here earns the deprecation warning.
  description: 'KQL filter expression (repeatable, ANDed together)',
} as const;

// Hidden: `--filter` is the old name of `--query`.
const trafficFilterOption = {
  name: 'filter',
  shorthand: null,
  type: [String],
  argument: 'EXPR',
  deprecated: true,
  description: 'Deprecated alias for `--query`',
} as const;

// Hidden: `--top` is the old name of `--limit`.
const trafficTopOption = {
  name: 'top',
  shorthand: null,
  type: Number,
  argument: 'NUMBER',
  deprecated: true,
  description: 'Deprecated alias for `--limit`',
} as const;

const trafficAlertOption = {
  name: 'alert',
  shorthand: null,
  type: String,
  argument: 'ALERT_ID',
  deprecated: false,
  description:
    'Scope the window and rule to one alert id from `firewall alerts list`',
} as const;

const trafficSinceOption = {
  ...sinceOption,
  description: `${sinceOption.description} (default: 24h ago)`,
} as const;

/**
 * The `--ip`-style narrowing flags, one per traffic dimension. Both traffic
 * subcommands take the whole set: `buildTrafficFilter` reads them by
 * dimension alias, so a subcommand that leaves one out rejects it as an
 * unknown option rather than narrowing by it.
 */
const trafficDimensionOptions = [
  trafficIpOption,
  trafficJa4Option,
  trafficAsnOption,
  trafficUserAgentOption,
  trafficPathOption,
  trafficRuleOption,
  trafficHostOption,
  trafficBotOption,
  trafficUnknownBotOption,
  trafficCountryOption,
  trafficActionOption,
] as const;

export const trafficListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'Show requests by firewall action, with the top clients behind them',
  arguments: [],
  options: [
    projectOption,
    jsonOutputOption,
    trafficSinceOption,
    untilOption,
    {
      ...limitOption,
      description: 'Rows per top list (default: 5)',
    },
    trafficTopOption,
    {
      name: 'dimension',
      shorthand: null,
      type: [String],
      argument: 'DIM',
      deprecated: false,
      description:
        'Top list to include: ip, ja4, asn, user-agent, path, rule, host, bot, unknown-bot, country, action (repeatable) (default: ip, ja4, asn, user-agent, path, rule, host, bot)',
    },
    trafficAlertOption,
    ...trafficDimensionOptions,
    trafficQueryOption,
    trafficFilterOption,
  ],
  examples: [
    {
      name: 'Show traffic from the last day',
      value: `${packageName} firewall traffic list`,
    },
    {
      name: 'Show the last hour, with the top 20 rows per list',
      value: `${packageName} firewall traffic list --since 1h --limit 20`,
    },
    {
      name: 'Show which countries and user agents denied traffic came from',
      value: `${packageName} firewall traffic list --action deny --dimension country --dimension user-agent`,
    },
  ],
} as const;

export const trafficInspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description:
    'Show one traffic dimension value: its actions over time and what it requested',
  arguments: [
    { name: 'dimension', required: true },
    { name: 'value', required: true },
  ],
  options: [
    projectOption,
    jsonOutputOption,
    trafficSinceOption,
    untilOption,
    {
      name: 'group-by',
      shorthand: null,
      type: String,
      argument: 'DIM',
      deprecated: false,
      description:
        'Dimension to break the traffic down by (default: depends on the inspected dimension)',
    },
    {
      ...limitOption,
      description: 'Rows in the breakdown (default: 10)',
    },
    trafficTopOption,
    trafficAlertOption,
    // Narrowing flags as well as the dimension argument: an inspected value
    // is often worth looking at through one more constraint — this IP's
    // denied requests, this path's traffic from one country — and the filter
    // they build is ANDed with the value the same way `list` does it.
    ...trafficDimensionOptions,
    trafficQueryOption,
    trafficFilterOption,
  ],
  examples: [
    {
      name: 'Inspect one client IP',
      value: `${packageName} firewall traffic inspect ip 1.2.3.4`,
    },
    {
      name: 'See which IPs a rule acted on',
      value: `${packageName} firewall traffic inspect rule rule_abc123 --group-by ip`,
    },
    {
      name: 'Inspect a path over the last week',
      value: `${packageName} firewall traffic inspect path /api/checkout --since 7d`,
    },
    {
      name: 'Narrow one client to what the firewall denied',
      value: `${packageName} firewall traffic inspect ip 1.2.3.4 --action deny`,
    },
  ],
} as const;

export const botManagementSubcommand = {
  name: 'bot-management',
  aliases: [],
  description: 'List managed bot rules and top unknown bot traffic',
  arguments: [],
  options: [projectOption, jsonOutputOption],
  examples: [
    {
      name: 'List managed bot rules and unknown bot traffic',
      value: `${packageName} firewall bot-management`,
    },
    {
      name: 'Update Bot Protection',
      value: `${packageName} firewall rules update bot-protection --action log --yes`,
    },
  ],
} as const;

export const trafficSubcommand = {
  name: 'traffic',
  aliases: [],
  description:
    'Explore firewall traffic: requests by action, top clients, and one dimension in detail',
  arguments: [],
  subcommands: [trafficListSubcommand, trafficInspectSubcommand],
  options: [],
  examples: [
    {
      name: 'Show traffic from the last day',
      value: `${packageName} firewall traffic list`,
    },
    {
      name: 'Inspect one client IP',
      value: `${packageName} firewall traffic inspect ip 1.2.3.4`,
    },
  ],
} as const;

export const firewallCommand = {
  name: 'firewall',
  aliases: [],
  summary: 'Manage firewall rules and bypass settings',
  description:
    "Manage your project's firewall rules, IP blocks, and system bypass configuration",
  arguments: [],
  subcommands: [
    overviewSubcommand,
    statusSubcommand,
    diffSubcommand,
    publishSubcommand,
    discardSubcommand,
    ipBlocksSubcommand,
    rulesSubcommand,
    botManagementSubcommand,
    systemBypassSubcommand,
    attackModeSubcommand,
    systemMitigationsSubcommand,
    alertsSubcommand,
    persistentActionsSubcommand,
    trafficSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Show firewall traffic',
      value: `${packageName} firewall traffic list`,
    },
    {
      name: 'List managed bot rules',
      value: `${packageName} firewall bot-management`,
    },
    {
      name: 'List firewall alerts',
      value: `${packageName} firewall alerts list`,
    },
    {
      name: 'List persistent firewall actions',
      value: `${packageName} firewall persistent-actions list`,
    },
    {
      name: 'Show firewall overview',
      value: `${packageName} firewall overview`,
    },
    {
      name: 'Show unpublished changes',
      value: `${packageName} firewall diff`,
    },
    {
      name: 'Add a system bypass for an IP',
      value: `${packageName} firewall system-bypass add 10.0.0.1`,
    },
  ],
} as const;
