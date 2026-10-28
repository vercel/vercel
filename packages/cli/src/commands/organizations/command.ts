import {
  formatOption,
  jsonOption,
  limitOption,
  nextCursorOption,
  yesOption,
} from '../../util/arg-common';

// Optional: an omitted target resolves from the active team's organization,
// so `--scope acme organizations inspect` works like every other command.
const organizationArgument = {
  // The help renderer adds the brackets for an optional argument.
  name: 'organization',
  required: false,
} as const;
const slugOption = {
  name: 'slug',
  shorthand: null,
  type: String,
  argument: 'SLUG',
  deprecated: false,
  description: 'Set the slug (required)',
} as const;
const nameOption = {
  name: 'name',
  shorthand: null,
  type: String,
  argument: 'NAME',
  deprecated: false,
  description: 'Set the display name',
} as const;
// One selector for the team being added, by ID or slug, like the id-or-slug
// arguments `vercel link` and `vercel vcr permissions` take. A `team_` prefix
// marks an ID; anything else is a slug, because a slug cannot hold
// underscores. The name avoids `--team`, which the root parser already owns as
// a deprecated alias for `--scope`.
const childTeamOption = {
  name: 'child-team',
  shorthand: null,
  type: String,
  argument: 'TEAM',
  deprecated: false,
  description: 'Select the existing team to add, by ID or slug (required)',
} as const;
const billingPlanOption = {
  name: 'billing-plan',
  shorthand: null,
  type: String,
  argument: 'BILLING_PLAN',
  deprecated: false,
  description: 'Set the child billing plan: platform or enterprise',
} as const;
// Both team operations change who pays for a team, so they need consent.
const billingYesOption = {
  ...yesOption,
  description: 'Confirm the billing change without a prompt',
} as const;
// `--limit` is a total across API pages, as the CLI design system defines it.
const listLimitOption = {
  ...limitOption,
  description: 'Number of results to return (default: 20, max: 100)',
} as const;
// The registry gives continuation no short flag, so `-N` stays off.
const listNextOption = { ...nextCursorOption, shorthand: null } as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List organizations you can view',
  arguments: [],
  options: [formatOption, jsonOption, listLimitOption, listNextOption],
  examples: [
    { name: 'List organizations', value: 'vercel organizations list' },
    {
      name: 'List organizations as JSON',
      value: 'vercel organizations list --json',
    },
    {
      name: 'Show the next page',
      value: 'vercel organizations list --limit 20 --next <CURSOR>',
      placeholders: ['<CURSOR>'],
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show an organization by ID or slug',
  arguments: [organizationArgument],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Inspect an organization by ID',
      value: 'vercel organizations inspect org_abc123',
    },
    { name: 'Inspect by slug', value: 'vercel organizations inspect acme' },
    {
      name: "Inspect the active team's organization",
      value: 'vercel --scope acme organizations inspect',
    },
  ],
} as const;

export const createSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create an organization using an existing team',
  arguments: [],
  options: [formatOption, jsonOption, slugOption, nameOption],
  examples: [
    {
      name: 'Create an organization from the active team',
      value: 'vercel organizations create --slug acme',
    },
    {
      name: 'Create an organization from another team',
      value: 'vercel --scope acme organizations create --slug acme',
    },
    {
      name: 'Create an organization with a display name',
      value:
        'vercel --scope acme organizations create --slug acme --name "Acme Inc"',
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update an organization slug',
  arguments: [organizationArgument],
  options: [formatOption, jsonOption, slugOption],
  examples: [
    {
      name: 'Change the slug',
      value: 'vercel organizations update org_abc123 --slug acme',
    },
    {
      name: "Change the active team's organization slug",
      value: 'vercel --scope acme organizations update --slug acme',
    },
  ],
} as const;

export const teamsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List teams in an organization',
  arguments: [organizationArgument],
  options: [formatOption, jsonOption, listLimitOption, listNextOption],
  examples: [
    {
      name: 'List organization teams as JSON',
      value: 'vercel organizations teams list org_abc123 --json',
    },
    {
      name: "List the active team's organization teams",
      value: 'vercel --scope acme organizations teams list',
    },
  ],
} as const;

export const teamsCreateSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create a child team billed through the organization',
  arguments: [organizationArgument],
  options: [
    formatOption,
    jsonOption,
    slugOption,
    { ...nameOption, description: 'Set the display name (required)' },
    {
      ...billingPlanOption,
      description:
        'Set the child billing plan: platform or enterprise (default: platform)',
    },
    billingYesOption,
  ],
  examples: [
    {
      name: 'Create a child team',
      value:
        'vercel organizations teams create org_abc123 --slug acme-web --name "Acme Web"',
    },
    {
      name: "Create a child team in the active team's organization",
      value:
        'vercel --scope acme organizations teams create --slug acme-web --name "Acme Web"',
    },
    {
      name: 'Create an enterprise child team in CI, after a person approves the billing change',
      value:
        'vercel organizations teams create org_abc123 --slug acme-web --name "Acme Web" --billing-plan enterprise --yes',
    },
  ],
} as const;

export const teamsAddSubcommand = {
  descriptionTone: 'normal',
  name: 'add',
  aliases: [],
  description:
    'Add an existing team and move its billing under the organization',
  arguments: [organizationArgument],
  options: [
    formatOption,
    jsonOption,
    childTeamOption,
    {
      ...billingPlanOption,
      description:
        'Set the child billing plan: platform or enterprise (default: derived from the existing team)',
    },
    billingYesOption,
  ],
  examples: [
    {
      name: 'Add an existing team by ID',
      value:
        'vercel organizations teams add org_abc123 --child-team team_abc123',
    },
    {
      name: 'Add an existing team by slug',
      value: 'vercel organizations teams add org_abc123 --child-team acme-web',
    },
    {
      name: 'Add an existing team in CI, after a person approves the billing change',
      value:
        'vercel organizations teams add org_abc123 --child-team acme-web --yes',
    },
  ],
} as const;

export const teamsSubcommand = {
  name: 'teams',
  aliases: ['team'],
  description: 'Manage organization child teams',
  arguments: [],
  options: [],
  subcommands: [teamsListSubcommand, teamsCreateSubcommand, teamsAddSubcommand],
  examples: [],
} as const;

export const organizationsCommand = {
  name: 'organizations',
  aliases: ['organization'],
  description: 'Manage Vercel organizations',
  arguments: [],
  options: [],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    createSubcommand,
    updateSubcommand,
    teamsSubcommand,
  ],
  examples: [
    { name: 'List organizations', value: 'vercel organizations list' },
  ],
} as const;
