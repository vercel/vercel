// Static metadata for all firewall condition types.
// Drives the interactive builder, flag parser, and format helpers.
// Keep in sync with the API's FirewallConditionType enum.

export interface ConditionTypeMeta {
  type: string;
  displayName: string;
  description: string;
  category: 'request' | 'client' | 'geo' | 'key-value' | 'security' | 'bot';
  requiresKey: boolean;
  operators: string[];
  /** Preset values for multi-select on `inc` operator in interactive mode */
  presetValues?: string[];
  /** Value validation type for interactive mode */
  valueValidation?: 'ip' | 'path' | 'hostname' | 'digits' | null;
  planRequirement?: 'enterprise' | 'security-plus' | null;
  /** Hidden from interactive builder by default (plan-gated or deprecated) */
  hiddenFromInteractive?: boolean;
  deprecated?: boolean;
}

// Operator groups matching the dashboard
const STRING_OPS = ['eq', 'inc'];
const STRING_MATCH_OPS = ['sub', 'pre', 'suf', 're'];
const KEY_EXISTS_OPS = ['ex'];
// All negatable via neg: true

const STRING_ONLY = [...STRING_OPS];
const STRING_AND_MATCH = [...STRING_OPS, ...STRING_MATCH_OPS];
const STRING_MATCH_AND_EXISTS = [
  ...STRING_OPS,
  ...STRING_MATCH_OPS,
  ...KEY_EXISTS_OPS,
];

export const CONDITION_TYPES: ConditionTypeMeta[] = [
  // Request
  {
    type: 'path',
    displayName: 'Request Path',
    description: 'URL path of the request',
    category: 'request',
    requiresKey: false,
    operators: STRING_AND_MATCH,
    valueValidation: 'path',
  },
  {
    type: 'route',
    displayName: 'Route',
    description: 'Route pattern (e.g., /blog/[slug])',
    category: 'request',
    requiresKey: false,
    operators: STRING_AND_MATCH,
    valueValidation: 'path',
  },
  {
    type: 'raw_path',
    displayName: 'Raw Path',
    description: 'Pre-rewrite URL path',
    category: 'request',
    requiresKey: false,
    operators: STRING_AND_MATCH,
    valueValidation: 'path',
  },
  {
    type: 'server_action',
    displayName: 'Server Action Name',
    description: 'Next.js Server Action name',
    category: 'request',
    requiresKey: false,
    operators: STRING_AND_MATCH,
  },
  {
    type: 'method',
    displayName: 'Method',
    description: 'HTTP method (GET, POST, DELETE, etc.)',
    category: 'request',
    requiresKey: false,
    operators: STRING_ONLY,
    presetValues: [
      'GET',
      'HEAD',
      'POST',
      'DELETE',
      'PATCH',
      'PUT',
      'CONNECT',
      'OPTIONS',
      'TRACE',
    ],
  },
  {
    type: 'host',
    displayName: 'Hostname',
    description: 'Request hostname',
    category: 'request',
    requiresKey: false,
    operators: STRING_AND_MATCH,
    valueValidation: 'hostname',
  },
  {
    type: 'protocol',
    displayName: 'Protocol',
    description: 'HTTP protocol version (HTTP/1.1, HTTP/2.0)',
    category: 'request',
    requiresKey: false,
    operators: STRING_ONLY,
    presetValues: ['HTTP/1.1', 'HTTP/2.0'],
  },
  {
    type: 'environment',
    displayName: 'Environment',
    description: 'Deployment environment (preview, production)',
    category: 'request',
    requiresKey: false,
    operators: STRING_ONLY,
    presetValues: ['preview', 'production'],
  },
  {
    type: 'region',
    displayName: 'Vercel Region',
    description: 'Edge region serving the request',
    category: 'request',
    requiresKey: false,
    operators: STRING_ONLY,
  },
  {
    type: 'target_path',
    displayName: 'Target Path',
    description: 'Post-rewrite destination path',
    category: 'request',
    requiresKey: false,
    operators: STRING_AND_MATCH,
    valueValidation: 'path',
  },
  {
    type: 'scheme',
    displayName: 'Scheme',
    description: 'Request scheme (http, https)',
    category: 'request',
    requiresKey: false,
    operators: STRING_ONLY,
    presetValues: ['http', 'https'],
  },
  {
    type: 'ssl',
    displayName: 'SSL',
    description: 'Whether the connection uses SSL/TLS',
    category: 'request',
    requiresKey: false,
    operators: ['ex'],
  },
  {
    type: 'request_body',
    displayName: 'Request Body',
    description: 'Request body content (Enterprise)',
    category: 'request',
    requiresKey: false,
    operators: STRING_AND_MATCH,
    planRequirement: 'enterprise',
    hiddenFromInteractive: true,
  },
  {
    type: 'rate_limit_api_id',
    displayName: 'Rate Limit API ID',
    description: 'Identifier for rate-limit API grouping',
    category: 'request',
    requiresKey: false,
    operators: STRING_ONLY,
    hiddenFromInteractive: true,
  },

  // Client
  {
    type: 'ip_address',
    displayName: 'IP Address',
    description: 'Client IP address or CIDR range',
    category: 'client',
    requiresKey: false,
    operators: STRING_ONLY,
    valueValidation: 'ip',
  },
  {
    type: 'user_agent',
    displayName: 'User Agent',
    description: 'Client User-Agent string',
    category: 'client',
    requiresKey: false,
    operators: STRING_AND_MATCH,
  },

  // Geo
  {
    type: 'geo_country',
    displayName: 'Country',
    description: 'Country code (ISO 3166-1 alpha-2)',
    category: 'geo',
    requiresKey: false,
    operators: STRING_ONLY,
  },
  {
    type: 'geo_continent',
    displayName: 'Continent',
    description: 'Continent code (AF, AN, AS, EU, NA, OC, SA)',
    category: 'geo',
    requiresKey: false,
    operators: STRING_ONLY,
    presetValues: ['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA'],
  },
  {
    type: 'geo_city',
    displayName: 'City',
    description: 'City name',
    category: 'geo',
    requiresKey: false,
    operators: STRING_AND_MATCH,
  },
  {
    type: 'geo_country_region',
    displayName: 'State / Region',
    description: 'State or region code',
    category: 'geo',
    requiresKey: false,
    operators: STRING_AND_MATCH,
  },
  {
    type: 'geo_as_number',
    displayName: 'AS Number',
    description: 'Autonomous System Number',
    category: 'geo',
    requiresKey: false,
    operators: STRING_AND_MATCH,
    valueValidation: 'digits',
  },

  // Key-Value
  {
    type: 'header',
    displayName: 'Request Header',
    description: 'HTTP request header (requires key)',
    category: 'key-value',
    requiresKey: true,
    operators: STRING_MATCH_AND_EXISTS,
  },
  {
    type: 'query',
    displayName: 'Query Parameter',
    description: 'URL query parameter (requires key)',
    category: 'key-value',
    requiresKey: true,
    operators: STRING_MATCH_AND_EXISTS,
  },
  {
    type: 'cookie',
    displayName: 'Cookie',
    description: 'HTTP cookie (requires key)',
    category: 'key-value',
    requiresKey: true,
    operators: STRING_MATCH_AND_EXISTS,
  },

  // Security
  {
    type: 'ja4_digest',
    displayName: 'JA4 Digest',
    description: 'JA4 TLS fingerprint',
    category: 'security',
    requiresKey: false,
    operators: STRING_AND_MATCH,
  },
  {
    type: 'ja3_digest',
    displayName: 'JA3 Digest',
    description: 'JA3 TLS fingerprint (Enterprise only)',
    category: 'security',
    requiresKey: false,
    operators: STRING_AND_MATCH,
    planRequirement: 'enterprise',
    hiddenFromInteractive: true,
  },

  // Bot
  {
    type: 'bot_name',
    displayName: 'Bot Name',
    description: 'Verified bot name (Security Plus)',
    category: 'bot',
    requiresKey: false,
    operators: STRING_AND_MATCH,
    planRequirement: 'security-plus',
    hiddenFromInteractive: true,
  },
  {
    type: 'bot_category',
    displayName: 'Bot Category',
    description: 'Verified bot category (Security Plus)',
    category: 'bot',
    requiresKey: false,
    operators: STRING_AND_MATCH,
    planRequirement: 'security-plus',
    hiddenFromInteractive: true,
  },
];

// Lookup map for quick access by type name
export const CONDITION_TYPE_MAP: Record<string, ConditionTypeMeta> =
  Object.fromEntries(CONDITION_TYPES.map(ct => [ct.type, ct]));

// All valid operator names (for flag validation)
export const ALL_OPERATORS = [
  'eq',
  'neq',
  'inc',
  'ninc',
  'sub',
  'pre',
  'suf',
  're',
  'ex',
  'nex',
  'gt',
  'gte',
  'lt',
  'lte',
];

// Category display names for the interactive builder
export const CATEGORY_LABELS: Record<string, string> = {
  request: 'Request',
  client: 'Client',
  geo: 'Geo / Location',
  'key-value': 'Key-Value (Header / Query / Cookie)',
  security: 'Security / TLS',
  bot: 'Bot Detection',
};

// Valid action types
export const VALID_ACTIONS = [
  'deny',
  'challenge',
  'log',
  'bypass',
  'rate_limit',
  'redirect',
] as const;

export type FirewallActionType = (typeof VALID_ACTIONS)[number];

// Valid durations
export const VALID_DURATIONS = ['1m', '5m', '15m', '30m', '1h'] as const;

// Valid rate limit algorithms
export const VALID_ALGORITHMS = ['fixed_window', 'token_bucket'] as const;
