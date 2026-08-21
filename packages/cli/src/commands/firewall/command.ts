import { packageName } from '../../util/pkg-name';
import { projectOption, yesOption } from '../../util/arg-common';

export const statusSubcommand = {
  name: 'status',
  aliases: [],
  description: 'Show firewall configuration and execution order',
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
    {
      name: 'graph',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Render the execution order as a graph with bypass paths',
    },
  ],
  examples: [
    {
      name: 'Show firewall status',
      value: `${packageName} firewall status`,
    },
    {
      name: 'Show firewall execution graph',
      value: `${packageName} firewall status --graph`,
    },
  ],
} as const;

export const overviewSubcommand = {
  name: 'overview',
  aliases: [],
  description: 'Show 1-day firewall traffic by action and rule',
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
      name: 'Show 1-day firewall traffic',
      value: `${packageName} firewall overview`,
    },
  ],
} as const;

const sinceOption = {
  name: 'since',
  shorthand: null,
  type: String,
  deprecated: false,
  description: 'Start of the time range (relative like 1h/1d/7d or ISO 8601)',
} as const;

const untilOption = {
  name: 'until',
  shorthand: null,
  type: String,
  deprecated: false,
  description: 'End of the time range (relative or ISO 8601, defaults to now)',
} as const;

const rawFilterOption = {
  name: 'filter',
  shorthand: null,
  type: [String],
  deprecated: false,
  description: 'Raw OData filter, e.g. "contains(request_path, \'/api\')"',
  argument: 'FILTER',
} as const;

const jsonOption = {
  name: 'json',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description: 'Output as JSON',
} as const;

/** One filter flag per traffic dimension (`--ip 1.2.3.4`, `--ja4 …`). */
const dimensionFilterOptions = [
  { name: 'ip', description: 'Filter by client IP' },
  { name: 'ja4', description: 'Filter by JA4 digest' },
  { name: 'asn', description: 'Filter by AS name' },
  { name: 'user-agent', description: 'Filter by user agent' },
  { name: 'path', description: 'Filter by request path' },
  { name: 'rule', description: 'Filter by firewall rule id' },
  { name: 'host', description: 'Filter by request hostname' },
  { name: 'bot', description: 'Filter by bot name' },
  { name: 'country', description: 'Filter by client country' },
  { name: 'action', description: 'Filter by firewall action' },
].map(o => ({
  ...o,
  shorthand: null,
  type: String,
  deprecated: false,
  argument: 'VALUE',
}));

export const alertsInspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show one firewall alert',
  arguments: [{ name: 'alert-id', required: true }],
  options: [projectOption, jsonOption],
  examples: [
    {
      name: 'Inspect an alert',
      value: `${packageName} firewall alerts inspect <alert-id>`,
    },
  ],
} as const;

export const alertsSubcommand = {
  name: 'alerts',
  aliases: [],
  description: 'List firewall alerts from the last 1 day',
  arguments: [],
  subcommands: [alertsInspectSubcommand],
  options: [projectOption, jsonOption],
  examples: [
    {
      name: 'List firewall alerts',
      value: `${packageName} firewall alerts`,
    },
    {
      name: 'Inspect an alert',
      value: `${packageName} firewall alerts inspect <alert-id>`,
    },
  ],
} as const;

export const persistentActionsInspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show one persistent action',
  arguments: [{ name: 'ip', required: true }],
  options: [
    projectOption,
    jsonOption,
    sinceOption,
    untilOption,
    {
      name: 'host',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Disambiguate by request hostname',
      argument: 'HOST',
    },
    {
      name: 'action',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Disambiguate by firewall action (challenge or deny)',
      argument: 'ACTION',
    },
    {
      name: 'top',
      shorthand: null,
      type: Number,
      deprecated: false,
      description: 'Number of top request paths (default 5)',
      argument: 'N',
    },
  ],
  examples: [
    {
      name: 'Inspect the most recent persistent action for an IP',
      value: `${packageName} firewall persistent-actions inspect 45.79.7.220`,
    },
    {
      name: 'Inspect a specific persistent action window',
      value: `${packageName} firewall persistent-actions inspect 45.79.7.220 --host vercel.com --action challenge --since 2025-08-13T18:10:46Z --until 2025-08-13T18:20:46Z`,
    },
  ],
} as const;

export const persistentActionsSubcommand = {
  name: 'persistent-actions',
  aliases: ['events', 'mitigations'],
  description: 'List enforced persistent actions from the past hour',
  arguments: [],
  subcommands: [persistentActionsInspectSubcommand],
  options: [
    projectOption,
    jsonOption,
    sinceOption,
    untilOption,
    {
      name: 'type',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Filter by type (system or customer)',
      argument: 'TYPE',
    },
    {
      name: 'action',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Filter by firewall action (challenge or deny)',
      argument: 'ACTION',
    },
    {
      name: 'ip',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Filter by client IP',
      argument: 'IP',
    },
    {
      name: 'host',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Filter by request hostname',
      argument: 'HOST',
    },
    {
      name: 'search',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Search by IP, hostname, or action',
      argument: 'QUERY',
    },
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      deprecated: false,
      description: 'Number of rows to show (default 10)',
      argument: 'N',
    },
  ],
  examples: [
    {
      name: 'List persistent actions from the past hour',
      value: `${packageName} firewall persistent-actions`,
    },
    {
      name: 'System-rule challenges from the past day',
      value: `${packageName} firewall persistent-actions --type system --action challenge --since 1d`,
    },
    {
      name: 'Inspect a persistent action by IP',
      value: `${packageName} firewall persistent-actions inspect 45.79.7.220`,
    },
  ],
} as const;

export const trafficInspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show traffic for one IP, path, rule, or other dimension',
  arguments: [
    { name: 'dimension', required: true },
    { name: 'value', required: true },
  ],
  options: [
    projectOption,
    jsonOption,
    sinceOption,
    untilOption,
    rawFilterOption,
    {
      name: 'group-by',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Breakdown dimension (ip, ja4, asn, user-agent, path, rule, host, bot, country, action)',
      argument: 'DIMENSION',
    },
    {
      name: 'top',
      shorthand: null,
      type: Number,
      deprecated: false,
      description: 'Number of breakdown rows (default 10)',
      argument: 'N',
    },
    {
      name: 'alert',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Limit to a firewall alert id',
      argument: 'ID',
    },
  ],
  examples: [
    {
      name: 'Inspect traffic from an IP',
      value: `${packageName} firewall traffic inspect ip 52.53.157.118`,
    },
    {
      name: 'Break an IP down by user agent',
      value: `${packageName} firewall traffic inspect ip 52.53.157.118 --group-by user-agent`,
    },
    {
      name: 'Inspect a JA4 digest over the past week',
      value: `${packageName} firewall traffic inspect ja4 t13d591100_a33745022dd6_dbd39dd1d406 --since 7d`,
    },
  ],
} as const;

export const botManagementSubcommand = {
  name: 'bot-management',
  aliases: [],
  description:
    'List managed bot rules (Bot Protection, AI Bots, BotID). Edit them with `firewall rules edit`',
  arguments: [],
  options: [projectOption, jsonOption],
  examples: [
    {
      name: 'List managed bot rules',
      value: `${packageName} firewall bot-management`,
    },
    {
      name: 'Edit Bot Protection',
      value: `${packageName} firewall rules edit bot-protection --action log --yes`,
    },
  ],
} as const;

export const trafficSubcommand = {
  name: 'traffic',
  aliases: ['traffic-dashboard'],
  description: 'Show 1-day firewall traffic by action and top clients',
  arguments: [],
  subcommands: [trafficInspectSubcommand],
  options: [
    projectOption,
    jsonOption,
    sinceOption,
    untilOption,
    rawFilterOption,
    {
      name: 'top',
      shorthand: null,
      type: Number,
      deprecated: false,
      description: 'Number of rows per widget (default 5)',
      argument: 'N',
    },
    ...dimensionFilterOptions,
    {
      name: 'alert',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Limit to a firewall alert id',
      argument: 'ID',
    },
  ],
  examples: [
    {
      name: 'Show firewall traffic for the past day',
      value: `${packageName} firewall traffic`,
    },
    {
      name: 'Traffic denied over the past hour',
      value: `${packageName} firewall traffic --action deny --since 1h`,
    },
    {
      name: 'Inspect one IP',
      value: `${packageName} firewall traffic inspect ip 1.2.3.4`,
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
  options: [projectOption, yesOption],
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
  options: [projectOption, yesOption],
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
    'List custom firewall rules and managed bot rules, including any unpublished draft changes',
  arguments: [],
  options: [
    projectOption,
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
    'Show a custom firewall rule or a managed bot rule (bot-protection, ai-bots, bot-id)',
  arguments: [{ name: 'name-or-id', required: true }],
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
      name: 'Inspect a rule by name',
      value: `${packageName} firewall rules inspect "Block bots"`,
    },
    {
      name: 'Inspect a managed bot rule',
      value: `${packageName} firewall rules inspect bot-protection`,
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
    projectOption,
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
    'Edit a custom firewall rule or a managed bot rule (bot-protection, ai-bots, bot-id). Stages a draft change — run `publish` to make it live',
  arguments: [{ name: 'name-or-id', required: true }],
  options: [
    projectOption,
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
  options: [projectOption, yesOption],
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
  options: [projectOption, yesOption],
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
  options: [projectOption, yesOption],
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
    projectOption,
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
    'Manage custom firewall rules and managed bot rules (Bot Protection, AI Bots, BotID)',
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

export const firewallCommand = {
  name: 'firewall',
  aliases: [],
  description:
    'Manage firewall rules and inspect traffic, alerts, and persistent actions',
  arguments: [],
  subcommands: [
    overviewSubcommand,
    statusSubcommand,
    alertsSubcommand,
    persistentActionsSubcommand,
    trafficSubcommand,
    botManagementSubcommand,
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
      name: 'Show 1-day firewall traffic',
      value: `${packageName} firewall overview`,
    },
    {
      name: 'Show firewall configuration',
      value: `${packageName} firewall status`,
    },
    {
      name: 'List firewall alerts',
      value: `${packageName} firewall alerts`,
    },
    {
      name: 'List persistent actions from the past hour',
      value: `${packageName} firewall persistent-actions`,
    },
    {
      name: 'Show firewall traffic',
      value: `${packageName} firewall traffic`,
    },
    {
      name: 'List managed bot rules',
      value: `${packageName} firewall bot-management`,
    },
    {
      name: 'Show unpublished changes',
      value: `${packageName} firewall diff`,
    },
  ],
} as const;
