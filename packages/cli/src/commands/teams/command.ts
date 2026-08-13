import { packageName } from '../../util/pkg-name';
import {
  formatOption,
  jsonOption,
  limitOption,
  nextOption,
  yesOption,
} from '../../util/arg-common';

export const requestSubcommand = {
  name: 'request',
  aliases: ['access-request'],
  description:
    'Show join-request status for the current team (defaults to the authenticated user)',
  arguments: [
    {
      name: 'userId',
      required: false,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Status for your pending request',
      value: `${packageName} teams request`,
    },
    {
      name: 'Status for another user id',
      value: `${packageName} teams request user_abc123`,
    },
  ],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: ['create'],
  description: 'Create a new team',
  arguments: [],
  options: [
    {
      name: 'slug',
      shorthand: null,
      type: String,
      description:
        'Team URL slug (e.g. acme for vercel.com/acme); required in non-interactive mode',
      deprecated: false,
    },
    {
      name: 'name',
      shorthand: null,
      type: String,
      description:
        'Display name for the team; required in non-interactive mode',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Create a team (interactive)',
      value: `${packageName} teams add`,
    },
    {
      name: 'Create a team non-interactively',
      value: `${packageName} teams add --slug acme --name "Acme Corp"`,
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: "Show all teams that you're a member of",
  arguments: [],
  options: [
    nextOption,
    limitOption,
    formatOption,
    jsonOption,
    { name: 'since', shorthand: null, type: String, deprecated: true },
    { name: 'until', shorthand: null, type: String, deprecated: true },
    { name: 'count', shorthand: 'C', type: Number, deprecated: true },
  ],
  examples: [
    {
      name: 'Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch',
      value: `${packageName} teams ls --next 1584722256178`,
    },
  ],
} as const;

export const switchSubcommand = {
  name: 'switch',
  aliases: ['change'],
  description: 'Switch to a different team',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [],
  examples: [
    {
      name: "Switch to a team. If your team's url is 'vercel.com/name', then 'name' is the slug. If the slug is omitted, you can choose interactively",
      value: `${packageName} teams switch <slug>`,
    },
  ],
  disabledGlobalOptions: ['token'],
} as const;

export const inviteSubcommand = {
  name: 'invite',
  aliases: [],
  description: 'Invite a new member to a team',
  arguments: [
    {
      name: 'email',
      required: true,
      multiple: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Invite new members (interactively)',
      value: `${packageName} teams invite`,
    },
    {
      name: 'Invite multiple members (required in non-interactive mode)',
      value: `${packageName} teams invite abc@vercel.com xyz@vercel.com`,
    },
  ],
} as const;

export const ssoSubcommand = {
  name: 'sso',
  aliases: [],
  description: 'Show SAML / SSO configuration for the current team',
  arguments: [],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Human-readable SAML summary',
      value: `${packageName} teams sso`,
    },
    {
      name: 'JSON',
      value: `${packageName} teams sso --json`,
    },
  ],
} as const;

export const membersSubcommand = {
  name: 'members',
  aliases: ['member'],
  description: 'List members for the currently scoped team',
  arguments: [],
  options: [nextOption, limitOption, formatOption, jsonOption],
  examples: [
    {
      name: 'List team members',
      value: `${packageName} teams members`,
    },
    {
      name: 'List team members as JSON',
      value: `${packageName} teams members --json`,
    },
    {
      name: 'Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch',
      value: `${packageName} teams members --next 1584722256178`,
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update settings for a team',
  arguments: [
    {
      name: 'team-slug',
      required: false,
    },
  ],
  options: [
    {
      name: 'name',
      shorthand: null,
      type: String,
      description: 'New display name for the team',
      deprecated: false,
    },
    {
      name: 'slug',
      shorthand: null,
      type: String,
      description: 'New URL slug for the team; this changes the team URL',
      deprecated: false,
    },
    {
      name: 'preview-suffix',
      shorthand: null,
      type: String,
      description:
        'Domain suffix for preview deployment URLs; pass an empty string to clear it',
      deprecated: false,
    },
    {
      name: 'toolbar',
      shorthand: null,
      type: String,
      description:
        'Vercel Toolbar on preview deployments: one of on, off, or default',
      deprecated: false,
    },
    {
      name: 'default-build-machine',
      shorthand: null,
      type: String,
      description:
        'Default build machine for new builds: one of basic, standard, enhanced, turbo, or elastic',
      deprecated: false,
    },
    {
      name: 'require-verified-commits',
      shorthand: null,
      type: String,
      description:
        'Require signed and verified commits before deployments: one of on or off',
      deprecated: false,
    },
    {
      name: 'sensitive-env-policy',
      shorthand: null,
      type: String,
      description:
        'Policy for creating Environment Variables as sensitive: one of on, off, or default',
      deprecated: false,
    },
    {
      name: 'ip-visibility',
      shorthand: null,
      type: String,
      description:
        'Show or hide IP addresses in Monitoring queries: one of on or off',
      deprecated: false,
    },
    {
      name: 'git-source-policy',
      shorthand: null,
      type: String,
      description:
        'Deployment policy git-source rules as a JSON array, or null to clear them',
      deprecated: false,
    },
    {
      name: 'deployment-source-policy',
      shorthand: null,
      type: String,
      description:
        'Deployment policy deployment-source rules as a JSON array, or null to clear them',
      deprecated: false,
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Rename the current team',
      value: `${packageName} teams update --name "Acme Corp"`,
    },
    {
      name: 'Change the team URL slug (asks for confirmation)',
      value: `${packageName} teams update --slug acme`,
    },
    {
      name: 'Update a specific team by slug',
      value: `${packageName} teams update acme --default-build-machine enhanced`,
    },
    {
      name: 'Require verified commits and sensitive Environment Variables',
      value: `${packageName} teams update --require-verified-commits on --sensitive-env-policy on`,
    },
    {
      name: 'Restrict deployment sources to git and CLI',
      value: `${packageName} teams update --deployment-source-policy '[{"enabled":true,"environments":[{"type":"system","target":"production"}],"sources":["git","cli"]}]'`,
    },
  ],
} as const;

export const teamsCommand = {
  name: 'teams',
  aliases: ['switch', 'team'],
  description: 'Manage Teams under your Vercel account',
  arguments: [],
  subcommands: [
    addSubcommand,
    inviteSubcommand,
    listSubcommand,
    requestSubcommand,
    switchSubcommand,
    ssoSubcommand,
    membersSubcommand,
    updateSubcommand,
  ],
  options: [],
  examples: [],
} as const;
