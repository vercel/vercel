import { packageName } from '../../util/pkg-name';
import { projectOption } from '../../util/arg-common';
import {
  allOption,
  formatOption,
  jsonOption,
  limitOption,
  nextCursorOption,
  yesOption,
} from '../../util/arg-common';

const sandboxRegionOption = {
  name: 'sandbox-region',
  shorthand: null,
  type: String,
  argument: 'REGION',
  description:
    'Set the default region for sandboxes created in the project. See the Vercel docs for available regions. Use "" to clear',
  deprecated: false,
} as const;

const sandboxFailoverRegionsOption = {
  name: 'sandbox-failover-regions',
  shorthand: null,
  type: String,
  argument: 'REGIONS',
  description:
    'Set the ordered, comma-separated failover regions for sandboxes created in the project. Requires a primary region and must not include it. Use "" to clear',
  deprecated: false,
} as const;

export const addSubcommand = {
  name: 'create',
  aliases: ['add'],
  description: 'Create a new project',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Create a new project',
      value: `${packageName} project create my-project`,
    },
  ],
} as const;

const checksBlocksOption = {
  name: 'blocks',
  shorthand: null,
  type: String,
  description:
    'When listing: filter by blocking stage. When adding: blocking stage for the new check. Values: build-start, deployment-start, deployment-alias, deployment-promotion, none',
  deprecated: false,
} as const;

export const checksAddFlags = [
  formatOption,
  jsonOption,
  checksBlocksOption,
  {
    name: 'file',
    shorthand: null,
    type: String,
    description:
      'Path to JSON file for the POST body (see REST: Create a check). Overrides --check-name / related options.',
    deprecated: false,
  },
  {
    name: 'check-name',
    shorthand: null,
    type: String,
    description:
      'Name of the deployment check (required with --requires unless --file is set)',
    deprecated: false,
  },
  {
    name: 'requires',
    shorthand: null,
    type: String,
    description:
      'When the check runs: build-ready, deployment-url, or none (required with --check-name unless --file)',
    deprecated: false,
  },
  {
    name: 'timeout',
    shorthand: null,
    type: Number,
    description: 'Timeout in seconds for the new check (default: 300)',
    deprecated: false,
  },
  {
    name: 'targets',
    shorthand: null,
    type: String,
    description: 'Comma-separated deployment targets (e.g. production,preview)',
    deprecated: false,
  },
  {
    name: 'source',
    shorthand: null,
    type: String,
    description:
      'JSON string for the `source` object (integration, webhook, or git-provider)',
    deprecated: false,
  },
] as const;

/** Flags for `vercel project checks remove` / `rm` (subset of shared `checks` help). */
export const checksRemoveFlags = [formatOption, jsonOption] as const;

export const checksSubcommand = {
  name: 'checks',
  aliases: [],
  summary: 'List, add, or remove deployment checks for a project',
  description:
    'List, add, or remove deployment checks for a project (GET/POST/DELETE /v2/projects/.../checks)',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [...checksAddFlags],
  examples: [
    {
      name: 'List checks for the linked project',
      value: `${packageName} project checks`,
    },
    {
      name: 'Checks that block production alias assignment',
      value: `${packageName} project checks --blocks deployment-alias`,
    },
    {
      name: 'Add a check from a JSON file',
      value: `${packageName} project checks add my-app --file ./check.json`,
    },
    {
      name: 'Add a check with options (requires integration/webhook setup in the body via --file or --source)',
      value: `${packageName} project checks add --check-name "CI" --requires deployment-url --blocks deployment-alias`,
    },
    {
      name: 'Remove a check by id',
      value: `${packageName} project checks remove chk_abc123 my-app`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Displays information related to a project',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [yesOption, formatOption, jsonOption],
  examples: [
    {
      name: 'Inspect the linked project from the current directory',
      value: `${packageName} project inspect`,
    },
    {
      name: 'Inspect the project named "my-project"',
      value: `${packageName} project inspect my-project`,
    },
    {
      name: 'Inspect a project as JSON',
      value: `${packageName} project inspect my-project --json`,
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'Show all projects in the selected scope',
  default: true,
  arguments: [],
  options: [
    nextCursorOption,
    limitOption,
    formatOption,
    jsonOption,
    {
      name: 'update-required',
      description: 'A list of projects affected by an upcoming deprecation',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'paused',
      description: 'Show only projects whose production traffic is paused',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'query',
      shorthand: 'q',
      type: String,
      argument: 'TEXT',
      description: 'Search projects by name (substring match)',
      deprecated: false,
    },
    // Hidden: `--filter` and `-f` are the old names of `--query`.
    {
      name: 'filter',
      shorthand: 'f',
      type: String,
      argument: 'NAME',
      description: 'Deprecated alias for `--query`',
      deprecated: true,
    },
  ],
  examples: [
    {
      name: 'Show the next page, using the cursor from the previous output',
      placeholders: ['<CURSOR>'],
      value: `${packageName} project list --next <CURSOR>`,
    },
    {
      name: 'List projects using a deprecated Node.js version in JSON format',
      value: `${packageName} project list --update-required --json`,
    },
    {
      name: 'Search projects by name',
      value: `${packageName} project list --query my-app`,
    },
    {
      name: 'List paused projects',
      value: `${packageName} project list --paused`,
    },
  ],
} as const;

export const pauseSubcommand = {
  descriptionTone: 'normal',
  name: 'pause',
  aliases: [],
  description:
    'Pause production traffic for a project (visitors will see an error page)',
  arguments: [
    {
      name: 'project',
      required: false,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Pause the linked project',
      value: `${packageName} project pause`,
    },
    {
      name: 'Pause the project named "my-project"',
      value: `${packageName} project pause my-project`,
    },
    {
      name: 'Pause a project and print the result as JSON',
      value: `${packageName} project pause my-project --json`,
    },
  ],
} as const;

export const resumeSubcommand = {
  name: 'resume',
  aliases: ['unpause'],
  description: 'Resume production traffic for paused projects',
  arguments: [
    {
      name: 'project',
      required: false,
      multiple: true,
    },
  ],
  options: [
    {
      ...allOption,
      // Acting on many projects takes `--all` spelled out, not `-a`.
      shorthand: null,
      description: 'Resume every paused project in the team',
    },
    {
      ...yesOption,
      description:
        'Skip the confirmation prompt when resuming several projects (--all also needs --scope or VERCEL_ORG_ID)',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Resume the linked project',
      value: `${packageName} project resume`,
    },
    {
      name: 'Resume the project named "my-project"',
      value: `${packageName} project resume my-project`,
    },
    {
      name: 'Resume several projects',
      value: `${packageName} project resume my-site my-api`,
    },
    {
      name: 'Resume every paused project in the team',
      value: `${packageName} project resume --all`,
    },
    {
      name: 'Resume every paused project in a team without a prompt',
      value: `${packageName} project resume --all --yes --scope my-team`,
    },
    {
      name: 'Resume a project and print the result as JSON',
      value: `${packageName} project resume my-project --json`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'delete',
  aliases: ['rm', 'del', 'remove'],
  description: 'Delete a project',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description:
        'Skip typing the project name. Without a terminal, also pass --scope unless you belong to only one team',
    },
  ],
  examples: [],
} as const;

export const renameSubcommand = {
  name: 'rename',
  aliases: [],
  description: 'Rename a project',
  arguments: [
    {
      name: 'name',
      required: true,
    },
    {
      name: 'new-name',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Rename a project',
      value: `${packageName} project rename my-project my-renamed-project`,
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: ['set'],
  description:
    'Update one or more project settings; omitted settings remain unchanged',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [
    {
      name: 'framework',
      shorthand: null,
      type: String,
      argument: 'SLUG',
      description:
        'Set the framework preset by slug; use "other" to clear the preset',
      deprecated: false,
    },
    {
      name: 'build-command',
      shorthand: null,
      type: String,
      argument: 'COMMAND',
      description: 'Set the build command',
      deprecated: false,
    },
    {
      name: 'dev-command',
      shorthand: null,
      type: String,
      argument: 'COMMAND',
      description: 'Set the development command',
      deprecated: false,
    },
    {
      name: 'install-command',
      shorthand: null,
      type: String,
      argument: 'COMMAND',
      description: 'Set the install command',
      deprecated: false,
    },
    {
      name: 'output-directory',
      shorthand: null,
      type: String,
      argument: 'DIR',
      description: 'Set the output directory',
      deprecated: false,
    },
    {
      name: 'root-directory',
      shorthand: null,
      type: String,
      argument: 'DIR',
      description: 'Set the project root directory',
      deprecated: false,
    },
    {
      name: 'auto-detect',
      shorthand: null,
      type: [String],
      argument: 'SETTING',
      description:
        'Reset a setting to automatic detection; repeat for build-command, dev-command, install-command, output-directory, or root-directory',
      deprecated: false,
    },
    {
      name: 'fluid-compute',
      shorthand: null,
      type: Boolean,
      description: 'Turn on Fluid compute',
      deprecated: false,
      legacyValues: { on: 'on', off: 'off' },
    },
    {
      name: 'no-fluid-compute',
      shorthand: null,
      type: Boolean,
      description: 'Turn off Fluid compute',
      deprecated: false,
    },
    {
      name: 'function-cpu',
      shorthand: null,
      type: String,
      argument: 'TIER',
      description:
        'Set the default function CPU/memory tier: standard_legacy, standard, performance, or performance_xl',
      deprecated: false,
    },
    sandboxRegionOption,
    sandboxFailoverRegionsOption,
    {
      name: 'build-machine',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      description:
        'Set the build machine type: basic, standard, enhanced, turbo, or elastic',
      deprecated: false,
    },
    {
      name: 'elastic-concurrency',
      shorthand: null,
      type: Boolean,
      description: 'Turn on elastic concurrency for builds',
      deprecated: false,
      legacyValues: { on: 'on', off: 'off' },
    },
    {
      name: 'no-elastic-concurrency',
      shorthand: null,
      type: Boolean,
      description: 'Turn off elastic concurrency for builds',
      deprecated: false,
    },
    {
      name: 'node-version',
      shorthand: null,
      type: String,
      argument: 'VERSION',
      description:
        'Set the Node.js version: 24.x, 22.x, 20.x, 18.x, 16.x, 14.x, 12.x, or 10.x',
      deprecated: false,
    },
    {
      ...yesOption,
      description:
        'Apply settings that do not affect charges without prompting',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Set the linked project framework preset to Next.js',
      value: `${packageName} project update --framework nextjs`,
    },
    {
      name: 'Set a named project framework preset to Vite',
      value: `${packageName} project update my-project --framework vite`,
    },
    {
      name: 'Update multiple settings in one command',
      value: `${packageName} project update my-project --build-command "pnpm build" --output-directory dist`,
    },
    {
      name: 'Reset individual settings to automatic detection',
      value: `${packageName} project update my-project --auto-detect build-command --auto-detect output-directory`,
    },
    {
      name: 'Enable Fluid compute and set the function CPU tier',
      value: `${packageName} project update my-project --fluid-compute --function-cpu performance`,
    },
    {
      name: 'Clear the framework preset and return JSON',
      value: `${packageName} project update my-project --framework other --json`,
    },
    {
      name: 'Update a setting without an interactive prompt',
      value: `${packageName} project update my-project --framework vite --yes`,
    },
    {
      name: 'Set the sandbox default and failover regions',
      value: `${packageName} project update my-project --sandbox-region sfo1 --sandbox-failover-regions cle1,iad1`,
    },
  ],
} as const;

export const tokenSubcommand = {
  name: 'token',
  aliases: [],
  description: 'Get a development OIDC token for a project',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [yesOption, formatOption, jsonOption],
  examples: [
    {
      name: 'Get a development OIDC token for the linked project',
      value: `${packageName} project token`,
    },
    {
      name: 'Get a development OIDC token for the project named "my-project"',
      value: `${packageName} project token my-project`,
    },
    {
      name: 'Get a development OIDC token as JSON',
      value: `${packageName} project token my-project --json`,
    },
  ],
} as const;

export const accessSummarySubcommand = {
  descriptionTone: 'normal',
  name: 'access-summary',
  aliases: ['summary'],
  description:
    'Show member counts by team role for project access (requires access groups entitlement)',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Summary for the linked project',
      value: `${packageName} project access-summary`,
    },
    {
      name: 'Summary as JSON',
      value: `${packageName} project access-summary my-app --json`,
    },
  ],
} as const;

export const membersRemoveFlags = [formatOption, jsonOption] as const;

export const PROJECT_MEMBER_ROLES = [
  'ADMIN',
  'PROJECT_DEVELOPER',
  'PROJECT_VIEWER',
  'PROJECT_GUEST',
] as const;

const memberRoleOption = {
  name: 'role',
  shorthand: null,
  type: String,
  argument: 'ROLE',
  description: `Project role when adding a member: ${PROJECT_MEMBER_ROLES.join(', ')}`,
  deprecated: false,
} as const;

export const membersAddFlags = [
  formatOption,
  jsonOption,
  memberRoleOption,
] as const;

export const membersSubcommand = {
  name: 'members',
  aliases: ['member'],
  description: 'List, add, or remove project members for a project',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [
    formatOption,
    jsonOption,
    {
      name: 'query',
      shorthand: 'q',
      type: String,
      argument: 'TEXT',
      description: 'Search project members by name, username, or email',
      deprecated: false,
    },
    // Hidden: `--search` is the old name of `--query`.
    {
      name: 'search',
      shorthand: null,
      type: String,
      description: 'Deprecated alias for `--query`',
      deprecated: true,
    },
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      description: 'Limit number of project members returned (1-100)',
      deprecated: false,
    },
    nextCursorOption,
    memberRoleOption,
  ],
  examples: [
    {
      name: 'List members for the linked project',
      value: `${packageName} project members`,
    },
    {
      name: 'List members for a named project as JSON',
      value: `${packageName} project members my-project --json`,
    },
    {
      name: 'Add a member to a project by email with a role',
      value: `${packageName} project members add my-project user@example.com --role PROJECT_VIEWER`,
    },
    {
      name: 'Remove a member from a project',
      value: `${packageName} project members remove my-project user@example.com`,
    },
  ],
} as const;

// The settings `project protection enable` and `disable` change.
const protectionToggleOptions = [
  {
    name: 'sso',
    shorthand: null,
    type: Boolean,
    description: 'Apply action to SSO protection.',
    deprecated: false,
  },
  {
    name: 'password',
    shorthand: null,
    type: Boolean,
    description:
      'Apply action to password protection (requires eligible plan/permissions).',
    deprecated: false,
  },
  {
    name: 'protection-password',
    shorthand: null,
    type: String,
    argument: 'PASSWORD',
    description:
      'Password value when enabling password protection (max 72 characters). Requires --password.',
    deprecated: false,
  },
  {
    name: 'customer-support-code-visibility',
    shorthand: null,
    type: Boolean,
    description: 'Apply action to customer support code visibility protection.',
    deprecated: false,
  },
  {
    name: 'skew',
    shorthand: null,
    type: Boolean,
    description: 'Apply action to skew protection.',
    deprecated: false,
  },
  {
    name: 'skew-max-age',
    shorthand: null,
    type: String,
    argument: 'SECONDS',
    description:
      'When enabling with --skew, max age in seconds for skew protection (default: 2592000, 30 days).',
    deprecated: false,
  },
  {
    name: 'protection-bypass',
    shorthand: null,
    type: Boolean,
    description: 'Apply action to automation protection bypass secrets.',
    deprecated: false,
  },
  {
    name: 'protection-bypass-secret',
    shorthand: null,
    type: String,
    argument: 'SECRET',
    description:
      'Optional secret value for protection bypass. Required when disabling bypass.',
    deprecated: false,
  },
  {
    name: 'git-fork-protection',
    shorthand: null,
    type: Boolean,
    description: 'Apply action to Git fork protection.',
    deprecated: false,
  },
] as const;

export const protectionEnableSubcommand = {
  name: 'enable',
  aliases: [],
  description: 'Turn on deployment protection settings for a project',
  arguments: [{ name: 'name', required: false }],
  options: [formatOption, jsonOption, ...protectionToggleOptions],
  examples: [
    {
      name: 'Enable password protection',
      value: `${packageName} project protection enable my-app --password`,
    },
    {
      name: 'Enable password protection with a password',
      placeholders: ['<password>'],
      value: `${packageName} project protection enable my-app --password --protection-password <password>`,
    },
    {
      name: 'Enable customer support code visibility',
      value: `${packageName} project protection enable my-app --customer-support-code-visibility`,
    },
    {
      name: 'Enable skew protection',
      value: `${packageName} project protection enable my-app --skew`,
    },
    {
      name: 'Enable skew protection with custom max age (seconds)',
      value: `${packageName} project protection enable my-app --skew --skew-max-age 604800`,
    },
    {
      name: 'Enable automation protection bypass',
      value: `${packageName} project protection enable my-app --protection-bypass`,
    },
    {
      name: 'Enable Git fork protection',
      value: `${packageName} project protection enable my-app --git-fork-protection`,
    },
    {
      name: 'Enable SSO deployment protection',
      value: `${packageName} project protection enable my-app --sso`,
    },
  ],
} as const;

export const protectionDisableSubcommand = {
  name: 'disable',
  aliases: [],
  description: 'Turn off deployment protection settings for a project',
  arguments: [{ name: 'name', required: false }],
  options: [formatOption, jsonOption, ...protectionToggleOptions],
  examples: [
    {
      name: 'Disable password protection',
      value: `${packageName} project protection disable my-app --password`,
    },
    {
      name: 'Disable customer support code visibility',
      value: `${packageName} project protection disable my-app --customer-support-code-visibility`,
    },
    {
      name: 'Disable skew protection',
      value: `${packageName} project protection disable my-app --skew`,
    },
    {
      name: 'Disable bypass with secret',
      placeholders: ['<secret>'],
      value: `${packageName} project protection disable my-app --protection-bypass --protection-bypass-secret <secret>`,
    },
    {
      name: 'Disable Git fork protection',
      value: `${packageName} project protection disable my-app --git-fork-protection`,
    },
    {
      name: 'Disable SSO for a named project',
      value: `${packageName} project protection disable my-app --sso`,
    },
  ],
} as const;

export const protectionSubcommand = {
  name: 'protection',
  aliases: [],
  description: 'Show or toggle deployment protection settings for a project',
  runsWithoutSubcommand: true,
  arguments: [{ name: 'name', required: false }],
  subcommands: [protectionEnableSubcommand, protectionDisableSubcommand],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Protection settings for the linked project',
      value: `${packageName} project protection`,
    },
    {
      name: 'Named project as JSON',
      value: `${packageName} project protection my-app --json`,
    },
    {
      name: 'Enable password protection',
      value: `${packageName} project protection enable my-app --password`,
    },
    {
      name: 'Disable password protection',
      value: `${packageName} project protection disable my-app --password`,
    },
  ],
} as const;

export const accessGroupsSubcommand = {
  name: 'access-groups',
  aliases: ['accessgroups'],
  description: 'List access groups for a project',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [
    formatOption,
    jsonOption,
    nextCursorOption,
    {
      name: 'query',
      shorthand: 'q',
      type: String,
      argument: 'TEXT',
      description: 'Search access groups by name',
      deprecated: false,
    },
    // Hidden: `--search` is the old name of `--query`.
    {
      name: 'search',
      shorthand: null,
      type: String,
      description: 'Deprecated alias for `--query`',
      deprecated: true,
    },
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      description: 'Limit number of access groups returned (1-100)',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'List access groups for the linked project',
      value: `${packageName} project access-groups`,
    },
    {
      name: 'List access groups for a named project as JSON',
      value: `${packageName} project access-groups my-project --json`,
    },
  ],
} as const;

export const webAnalyticsEnableSubcommand = {
  name: 'enable',
  aliases: [],
  default: true,
  description: 'Turn on Web Analytics for a project',
  arguments: [{ name: 'name', required: false }],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Enable Web Analytics for a named project',
      value: `${packageName} project web-analytics enable my-project`,
    },
    {
      name: 'Enable Web Analytics and print the result as JSON',
      value: `${packageName} project web-analytics enable my-project --json`,
    },
  ],
} as const;

export const webAnalyticsDisableSubcommand = {
  name: 'disable',
  aliases: [],
  description: 'Turn off Web Analytics for a project',
  arguments: [{ name: 'name', required: false }],
  options: [
    {
      ...yesOption,
      description:
        'Skip the confirmation prompt when disabling. Without a terminal, team projects also need --scope',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Disable Web Analytics for a named project',
      value: `${packageName} project web-analytics disable my-project`,
    },
    {
      name: 'Disable Web Analytics and print the result as JSON (non-interactive / agents)',
      value: `${packageName} project web-analytics disable my-project --yes --json`,
    },
  ],
} as const;

export const webAnalyticsSubcommand = {
  name: 'web-analytics',
  aliases: [],
  description: 'Enable or disable Web Analytics for a project',
  arguments: [],
  subcommands: [webAnalyticsEnableSubcommand, webAnalyticsDisableSubcommand],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Enable Web Analytics for the linked project (omitting the action defaults to enable)',
      value: `${packageName} project web-analytics`,
    },
    {
      name: 'Enable Web Analytics for a named project',
      value: `${packageName} project web-analytics enable my-project`,
    },
    {
      name: 'Disable Web Analytics for a named project',
      value: `${packageName} project web-analytics disable my-project`,
    },
    {
      name: 'Disable Web Analytics and print the result as JSON (non-interactive / agents)',
      value: `${packageName} project web-analytics disable my-project --yes --json`,
    },
    {
      name: 'Enable Web Analytics and print the result as JSON',
      value: `${packageName} project web-analytics enable my-project --json`,
    },
  ],
} as const;

export const speedInsightsEnableSubcommand = {
  name: 'enable',
  aliases: [],
  default: true,
  description: 'Turn on Speed Insights for a project',
  arguments: [{ name: 'name', required: false }],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Enable Speed Insights for a named project',
      value: `${packageName} project speed-insights enable my-project`,
    },
  ],
} as const;

export const speedInsightsDisableSubcommand = {
  name: 'disable',
  aliases: [],
  description: 'Turn off Speed Insights for a project',
  arguments: [{ name: 'name', required: false }],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Disable Speed Insights for a named project',
      value: `${packageName} project speed-insights disable my-project`,
    },
    {
      name: 'Disable Speed Insights and print the result as JSON',
      value: `${packageName} project speed-insights disable my-project --json`,
    },
  ],
} as const;

export const speedInsightsSubcommand = {
  name: 'speed-insights',
  aliases: [],
  description: 'Enable or disable Speed Insights for a project',
  arguments: [],
  subcommands: [speedInsightsEnableSubcommand, speedInsightsDisableSubcommand],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Enable Speed Insights for the linked project',
      value: `${packageName} project speed-insights`,
    },
    {
      name: 'Enable Speed Insights for a named project',
      value: `${packageName} project speed-insights enable my-project`,
    },
    {
      name: 'Disable Speed Insights for a named project',
      value: `${packageName} project speed-insights disable my-project`,
    },
    {
      name: 'Disable Speed Insights and print the result as JSON',
      value: `${packageName} project speed-insights disable my-project --json`,
    },
  ],
} as const;

export const observabilityEnableSubcommand = {
  name: 'enable',
  aliases: [],
  description: 'Turn on Observability Plus for a project',
  arguments: [{ name: 'name', required: false }],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Enable Observability Plus for the linked project',
      value: `${packageName} project observability enable`,
    },
    {
      name: 'Enable Observability Plus and print the result as JSON',
      value: `${packageName} project observability enable my-project --json`,
    },
  ],
} as const;

export const observabilityDisableSubcommand = {
  name: 'disable',
  aliases: [],
  description: 'Turn off Observability Plus for a project',
  arguments: [{ name: 'name', required: false }],
  options: [
    {
      ...yesOption,
      description:
        'Skip the confirmation prompt when disabling. Without a terminal, team projects also need --scope',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Disable Observability Plus for a named project',
      value: `${packageName} project observability disable my-project`,
    },
    {
      name: 'Disable Observability Plus and print the result as JSON',
      value: `${packageName} project observability disable my-project --yes --scope my-team --json`,
    },
  ],
} as const;

export const observabilitySubcommand = {
  name: 'observability',
  aliases: [],
  description: 'Enable or disable Observability Plus for a project',
  arguments: [],
  subcommands: [observabilityEnableSubcommand, observabilityDisableSubcommand],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Enable Observability Plus for the linked project',
      value: `${packageName} project observability enable`,
    },
    {
      name: 'Disable Observability Plus for a named project',
      value: `${packageName} project observability disable my-project`,
    },
    {
      name: 'Enable Observability Plus and print the result as JSON',
      value: `${packageName} project observability enable my-project --json`,
    },
    {
      name: 'Disable Observability Plus and print the result as JSON',
      value: `${packageName} project observability disable my-project --yes --scope my-team --json`,
    },
  ],
} as const;

export const priorityEnableSubcommand = {
  name: 'enable',
  aliases: [],
  description: 'Upgrade a project to Priority',
  arguments: [{ name: 'name', required: false }],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Upgrade the linked project to Priority',
      value: `${packageName} project priority enable`,
    },
    {
      name: 'Upgrade a named project to Priority',
      value: `${packageName} project priority enable my-project`,
    },
  ],
} as const;

export const priorityDisableSubcommand = {
  name: 'disable',
  aliases: [],
  description: 'Remove the Priority upgrade from a project',
  arguments: [{ name: 'name', required: false }],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Remove Priority from a named project',
      value: `${packageName} project priority disable my-project`,
    },
  ],
} as const;

export const prioritySubcommand = {
  name: 'priority',
  aliases: ['priority-project'],
  description: 'Upgrade a project to Priority, or remove that upgrade',
  arguments: [],
  subcommands: [priorityEnableSubcommand, priorityDisableSubcommand],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Upgrade the linked project to Priority',
      value: `${packageName} project priority enable`,
    },
    {
      name: 'Upgrade a named project to Priority',
      value: `${packageName} project priority enable my-project`,
    },
    {
      name: 'Remove Priority from a named project',
      value: `${packageName} project priority disable my-project`,
    },
  ],
} as const;

export const dangerouslyDeleteImmutableStaticAssetSubcommand = {
  descriptionTone: 'normal',
  name: 'dangerously-delete-immutable-static-asset',
  aliases: [],
  // Break-glass command: excluded from `project --help` on purpose.
  hidden: true,
  description:
    'Permanently delete an immutable static asset from storage. This action can not be undone. Any request to this static asset will serve a 410 response for 7 days and then return a 404.',
  arguments: [
    {
      name: 'path',
      required: true,
    },
  ],
  options: [projectOption],
  examples: [
    {
      name: 'Permanently delete an immutable static asset from storage',
      value: `${packageName} project dangerously-delete-immutable-static-asset _next/static/immutable/chunks/example.js`,
    },
  ],
} as const;

export const projectCommand = {
  name: 'project',
  aliases: ['projects'],
  description: 'Manage your Vercel projects',
  arguments: [],
  subcommands: [
    addSubcommand,
    accessSummarySubcommand,
    checksSubcommand,
    inspectSubcommand,
    listSubcommand,
    membersSubcommand,
    accessGroupsSubcommand,
    protectionSubcommand,
    webAnalyticsSubcommand,
    speedInsightsSubcommand,
    pauseSubcommand,
    observabilitySubcommand,
    prioritySubcommand,
    resumeSubcommand,
    updateSubcommand,
    renameSubcommand,
    removeSubcommand,
    tokenSubcommand,
    dangerouslyDeleteImmutableStaticAssetSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List projects in the current scope',
      value: `${packageName} project list`,
    },
    {
      name: 'Inspect a project',
      value: `${packageName} project inspect my-project`,
    },
    {
      name: 'Pause production traffic for a project',
      value: `${packageName} project pause my-project`,
    },
  ],
} as const;
