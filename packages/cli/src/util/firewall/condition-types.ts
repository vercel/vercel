// Static metadata for all firewall condition types.
// Drives the interactive builder, flag parser, and format helpers.
// Keep in sync with the API's FirewallConditionType enum.

export interface PresetValue {
  label: string;
  value: string;
}

export interface ConditionTypeMeta {
  type: string;
  displayName: string;
  description: string;
  category: 'request' | 'client' | 'geo' | 'key-value' | 'security' | 'bot';
  requiresKey: boolean;
  operators: string[];
  /** Preset values for select/multi-select in interactive mode */
  presetValues?: PresetValue[];
  /** Value validation type for interactive mode */
  valueValidation?: 'ip' | 'path' | 'hostname' | 'digits' | null;
  planRequirement?: 'enterprise' | 'security-plus' | null;
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
  },
  {
    type: 'route',
    displayName: 'Route',
    description: 'Route pattern (e.g., /blog/[slug])',
    category: 'request',
    requiresKey: false,
    operators: STRING_AND_MATCH,
  },
  {
    type: 'raw_path',
    displayName: 'Raw Path',
    description: 'Pre-rewrite URL path',
    category: 'request',
    requiresKey: false,
    operators: STRING_AND_MATCH,
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
      { label: 'GET', value: 'GET' },
      { label: 'HEAD', value: 'HEAD' },
      { label: 'POST', value: 'POST' },
      { label: 'DELETE', value: 'DELETE' },
      { label: 'PATCH', value: 'PATCH' },
      { label: 'PUT', value: 'PUT' },
      { label: 'CONNECT', value: 'CONNECT' },
      { label: 'OPTIONS', value: 'OPTIONS' },
      { label: 'TRACE', value: 'TRACE' },
      { label: 'DEBUG', value: 'DEBUG' },
      { label: 'QUERY', value: 'QUERY' },
    ],
  },
  {
    type: 'host',
    displayName: 'Hostname',
    description: 'Request hostname',
    category: 'request',
    requiresKey: false,
    operators: STRING_AND_MATCH,
  },
  {
    type: 'protocol',
    displayName: 'Protocol',
    description: 'HTTP protocol version (HTTP/1.1, HTTP/2.0)',
    category: 'request',
    requiresKey: false,
    operators: STRING_ONLY,
    presetValues: [
      { label: 'HTTP/1.1', value: 'HTTP/1.1' },
      { label: 'HTTP/2.0', value: 'HTTP/2.0' },
    ],
  },
  {
    type: 'environment',
    displayName: 'Environment',
    description: 'Deployment environment (preview, production)',
    category: 'request',
    requiresKey: false,
    operators: STRING_ONLY,
    presetValues: [
      { label: 'Preview', value: 'preview' },
      { label: 'Production', value: 'production' },
    ],
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
    presetValues: [
      { label: 'http', value: 'http' },
      { label: 'https', value: 'https' },
    ],
  },
  {
    type: 'rate_limit_api_id',
    displayName: 'Rate Limit API ID',
    description: 'Identifier for rate-limit API grouping',
    category: 'request',
    requiresKey: false,
    operators: STRING_ONLY,
  },

  // Client
  {
    type: 'ip_address',
    displayName: 'IP Address',
    description: 'Client IP address or CIDR range',
    category: 'client',
    requiresKey: false,
    operators: STRING_ONLY,
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
    presetValues: [
      { label: 'Africa (AF)', value: 'AF' },
      { label: 'Antarctica (AN)', value: 'AN' },
      { label: 'Asia (AS)', value: 'AS' },
      { label: 'Europe (EU)', value: 'EU' },
      { label: 'North America (NA)', value: 'NA' },
      { label: 'Oceania (OC)', value: 'OC' },
      { label: 'South America (SA)', value: 'SA' },
    ],
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
    description: 'JA3 TLS fingerprint',
    category: 'security',
    requiresKey: false,
    operators: STRING_AND_MATCH,
    planRequirement: 'enterprise',
  },

  // Bot
  {
    type: 'bot_name',
    displayName: 'Bot Name',
    description: 'Verified bot name',
    category: 'bot',
    requiresKey: false,
    operators: STRING_AND_MATCH,
    planRequirement: 'security-plus',
  },
  {
    type: 'bot_category',
    displayName: 'Bot Category',
    description: 'Verified bot category',
    category: 'bot',
    requiresKey: false,
    operators: STRING_AND_MATCH,
    planRequirement: 'security-plus',
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
