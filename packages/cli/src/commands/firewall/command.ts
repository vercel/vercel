import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const overviewSubcommand = {
  name: 'overview',
  aliases: [],
  description:
    "Show a summary of your project's firewall configuration, including active rules, IP blocks, bypasses, and any unpublished draft changes",
  arguments: [],
  options: [
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
      name: 'Show firewall overview',
      value: `${packageName} firewall overview`,
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
  ],
} as const;

export const publishSubcommand = {
  name: 'publish',
  aliases: [],
  description:
    'Publish all draft firewall changes to production, making them live immediately',
  arguments: [],
  options: [yesOption],
  examples: [
    {
      name: 'Publish draft changes',
      value: `${packageName} firewall publish`,
    },
    {
      name: 'Publish without confirmation',
      value: `${packageName} firewall publish --yes`,
    },
  ],
} as const;

export const discardSubcommand = {
  name: 'discard',
  aliases: [],
  description:
    'Permanently discard all unpublished draft changes, reverting to the current production configuration',
  arguments: [],
  options: [yesOption],
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
  name: 'add',
  aliases: [],
  description:
    'Add a system bypass rule to allow a specific IP address to skip firewall checks. Takes effect immediately (no publish required)',
  arguments: [{ name: 'ip', required: true }],
  options: [
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
  name: 'remove',
  aliases: ['rm'],
  description:
    'Remove a system bypass rule so the IP is no longer exempt from firewall checks. Takes effect immediately (no publish required)',
  arguments: [{ name: 'ip', required: true }],
  options: [
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
    'List all custom firewall rules, including any unpublished draft changes',
  arguments: [],
  options: [
    {
      name: 'expand',
      shorthand: 'e',
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
  ],
} as const;

export const rulesInspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description:
    'Show the full configuration of a custom firewall rule, including conditions, action, and rate limit settings',
  arguments: [{ name: 'name-or-id', required: true }],
  options: [
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
  ],
} as const;

export const rulesAddSubcommand = {
  name: 'add',
  aliases: [],
  description:
    'Create a new custom firewall rule using AI, an interactive builder, JSON, or command-line flags. Stages a draft change — run `publish` to make it live',
  arguments: [{ name: 'name', required: false }],
  options: [
    {
      name: 'ai',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Generate rule from natural language (AI-powered)',
    },
    {
      name: 'json',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Create rule from JSON payload',
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
      name: 'disabled',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Create as disabled (default: enabled)',
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
      description: 'Permanent redirect (301). Default: temporary (307)',
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
      value: `${packageName} firewall rules add --json '{"name":"Block bots","active":true,"conditionGroup":[{"conditions":[{"type":"user_agent","op":"sub","value":"crawler"}]}],"action":{"mitigate":{"action":"deny"}}}'`,
    },
    {
      name: 'Create with flags',
      value: `${packageName} firewall rules add "Block bots" --condition '{"type":"user_agent","op":"sub","value":"crawler"}' --action deny --yes`,
    },
    {
      name: 'Create with OR groups',
      value: `${packageName} firewall rules add "Block suspicious" --condition '{"type":"user_agent","op":"sub","value":"crawler"}' --or --condition '{"type":"ip_address","op":"eq","value":"1.2.3.4"}' --action deny --yes`,
    },
  ],
} as const;

export const rulesEditSubcommand = {
  name: 'edit',
  aliases: [],
  description:
    'Edit an existing custom firewall rule using AI, an interactive editor, JSON, or command-line flags. Stages a draft change — run `publish` to make it live',
  arguments: [{ name: 'name-or-id', required: true }],
  options: [
    {
      name: 'ai',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Describe changes using natural language (AI-powered)',
    },
    {
      name: 'json',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Replace rule with JSON payload',
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
      name: 'enabled',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Set rule to enabled',
    },
    {
      name: 'disabled',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Set rule to disabled',
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
      description: 'Permanent redirect (301). Default: temporary (307)',
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Interactive mode',
      value: `${packageName} firewall rules edit "My Rule"`,
    },
    {
      name: 'Edit with AI',
      value: `${packageName} firewall rules edit "My Rule" --ai "Change action to challenge"`,
    },
    {
      name: 'Change action via flags',
      value: `${packageName} firewall rules edit "My Rule" --action challenge --duration 5m --yes`,
    },
    {
      name: 'Replace conditions',
      value: `${packageName} firewall rules edit "My Rule" --condition '{"type":"path","op":"pre","value":"/new"}' --yes`,
    },
    {
      name: 'Rename a rule',
      value: `${packageName} firewall rules edit "My Rule" --name "New Name" --yes`,
    },
  ],
} as const;

export const rulesEnableSubcommand = {
  name: 'enable',
  aliases: [],
  description:
    'Enable a disabled custom firewall rule. Stages a draft change — run `publish` to make it live',
  arguments: [{ name: 'name-or-id', required: true }],
  options: [yesOption],
  examples: [
    {
      name: 'Enable a rule',
      value: `${packageName} firewall rules enable "My Rule"`,
    },
  ],
} as const;

export const rulesDisableSubcommand = {
  name: 'disable',
  aliases: [],
  description:
    'Disable a custom firewall rule without removing it. Stages a draft change — run `publish` to make it live',
  arguments: [{ name: 'name-or-id', required: true }],
  options: [yesOption],
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
  options: [yesOption],
  examples: [
    {
      name: 'Remove a rule',
      value: `${packageName} firewall rules remove "My Rule" --yes`,
    },
  ],
} as const;

export const rulesReorderSubcommand = {
  name: 'reorder',
  aliases: ['move'],
  description:
    'Change the priority order of a custom firewall rule. Stages a draft change — run `publish` to make it live',
  arguments: [{ name: 'name-or-id', required: true }],
  options: [
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
      value: `${packageName} firewall rules reorder "My Rule" --first --yes`,
    },
    {
      name: 'Move to position 3',
      value: `${packageName} firewall rules reorder "My Rule" --position 3 --yes`,
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
      name: 'Edit with AI',
      value: `${packageName} firewall rules edit "My Rule" --ai "Change action to challenge"`,
    },
  ],
} as const;

export const attackModeEnableSubcommand = {
  name: 'enable',
  aliases: [],
  description:
    'Enable attack mode — all visitors will be shown a verification challenge before accessing your site. Takes effect immediately (no publish required)',
  arguments: [],
  options: [
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
  name: 'disable',
  aliases: [],
  description:
    'Disable attack mode — visitors will no longer be challenged. Takes effect immediately (no publish required)',
  arguments: [],
  options: [yesOption],
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
  name: 'pause',
  aliases: [],
  description:
    'Pause automatic DDoS protection and system-level traffic filtering for 24 hours. Takes effect immediately (no publish required)',
  arguments: [],
  options: [yesOption],
  examples: [
    {
      name: 'Pause system mitigations',
      value: `${packageName} firewall system-mitigations pause`,
    },
  ],
} as const;

export const systemMitigationsResumeSubcommand = {
  name: 'resume',
  aliases: [],
  description:
    'Resume automatic DDoS protection and system-level traffic filtering. Takes effect immediately (no publish required)',
  arguments: [],
  options: [yesOption],
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

export const firewallCommand = {
  name: 'firewall',
  aliases: [],
  description:
    "Manage your project's firewall rules, IP blocks, and system bypass configuration",
  hidden: true as const,
  arguments: [],
  subcommands: [
    overviewSubcommand,
    diffSubcommand,
    publishSubcommand,
    discardSubcommand,
    ipBlocksSubcommand,
    rulesSubcommand,
    systemBypassSubcommand,
    attackModeSubcommand,
    systemMitigationsSubcommand,
  ],
  options: [],
  examples: [
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
