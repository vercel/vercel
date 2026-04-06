import { packageName } from '../../util/pkg-name';
import {
  formatOption,
  jsonOption,
  nextOption,
  yesOption,
} from '../../util/arg-common';

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a new project',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Add a new project',
      value: `${packageName} project add my-project`,
    },
  ],
} as const;

/** Shared `--blocks` enum for list (query) and `checks add` (request body). */
const checksBlocksOption = {
  name: 'blocks',
  shorthand: null,
  type: String,
  description:
    'When listing: filter by blocking stage. When adding: blocking stage for the new check. Values: build-start, deployment-start, deployment-alias, deployment-promotion, none',
  deprecated: false,
} as const;

/** Flags for `vercel project checks add` (also merged into `checks` help). */
export const checksAddFlags = [
  formatOption,
  checksBlocksOption,
  {
    name: 'file',
    shorthand: null,
    type: String,
    description:
      'Path to JSON file for the POST body (see REST: Create a check). Overrides --check-name / related flags.',
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
    description: 'Timeout in seconds for the new check (default 300)',
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
export const checksRemoveFlags = [formatOption] as const;

export const checksSubcommand = {
  name: 'checks',
  aliases: [],
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
      name: 'Add a check with flags (requires integration/webhook setup in the body via --file or --source)',
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
  options: [yesOption],
  examples: [
    {
      name: 'Inspect the linked project from the current directory',
      value: `${packageName} project inspect`,
    },
    {
      name: 'Inspect the project named "my-project"',
      value: `${packageName} project inspect my-project`,
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
    nextOption,
    formatOption,
    jsonOption,
    {
      name: 'update-required',
      description: 'A list of projects affected by an upcoming deprecation',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Paginate projects, where `1584722256178` is the time in milliseconds since the UNIX epoch',
      value: `${packageName} project ls --next 1584722256178`,
    },
    {
      name: 'List projects using a deprecated Node.js version in JSON format',
      value: `${packageName} project ls --update-required --format=json`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Delete a project',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [],
  examples: [],
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
  options: [yesOption],
  examples: [
    {
      name: 'Get a development OIDC token for the linked project',
      value: `${packageName} project token`,
    },
    {
      name: 'Get a development OIDC token for the project named "my-project"',
      value: `${packageName} project token my-project`,
    },
  ],
} as const;

export const accessSummarySubcommand = {
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
  options: [formatOption],
  examples: [
    {
      name: 'Summary for the linked project',
      value: `${packageName} project access-summary`,
    },
    {
      name: 'Summary as JSON',
      value: `${packageName} project access-summary my-app --format json`,
    },
  ],
} as const;

export const membersSubcommand = {
  name: 'members',
  aliases: ['member'],
  description: 'List project members for a project',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [
    formatOption,
    {
      name: 'search',
      shorthand: null,
      type: String,
      description: 'Filter project members by name, username, or email',
      deprecated: false,
    },
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      description: 'Limit number of project members returned (1-100)',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'List members for the linked project',
      value: `${packageName} project members`,
    },
    {
      name: 'List members for a named project as JSON',
      value: `${packageName} project members my-project --format json`,
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
    nextOption,
    {
      name: 'search',
      shorthand: null,
      type: String,
      description: 'Search access groups by name',
      deprecated: false,
    },
    {
      name: 'limit',
      shorthand: null,
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
      value: `${packageName} project access-groups my-project --format json`,
    },
  ],
} as const;

export const webAnalyticsSubcommand = {
  name: 'web-analytics',
  aliases: [],
  description: 'Enable Web Analytics for a project',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [formatOption],
  examples: [
    {
      name: 'Enable Web Analytics for the linked project',
      value: `${packageName} project web-analytics`,
    },
    {
      name: 'Enable Web Analytics for a named project',
      value: `${packageName} project web-analytics my-project`,
    },
    {
      name: 'Confirm enablement as JSON (non-interactive / agents)',
      value: `${packageName} project web-analytics --format json`,
    },
  ],
} as const;

export const speedInsightsSubcommand = {
  name: 'speed-insights',
  aliases: [],
  description: 'Enable Speed Insights for a project',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [formatOption],
  examples: [
    {
      name: 'Enable Speed Insights for the linked project',
      value: `${packageName} project speed-insights`,
    },
    {
      name: 'Enable Speed Insights for a named project',
      value: `${packageName} project speed-insights my-project`,
    },
    {
      name: 'Confirm enablement as JSON (non-interactive / agents)',
      value: `${packageName} project speed-insights --format json`,
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
    webAnalyticsSubcommand,
    speedInsightsSubcommand,
    removeSubcommand,
    tokenSubcommand,
  ],
  options: [],
  examples: [],
} as const;
