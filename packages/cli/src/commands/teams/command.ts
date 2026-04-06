import { packageName } from '../../util/pkg-name';
import { formatOption, nextOption } from '../../util/arg-common';

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
  options: [formatOption],
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
    formatOption,
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

export const membersSubcommand = {
  name: 'members',
  aliases: ['member'],
  description: 'List members for the currently scoped team',
  arguments: [],
  options: [nextOption, formatOption],
  examples: [
    {
      name: 'List team members',
      value: `${packageName} teams members`,
    },
    {
      name: 'List team members as JSON',
      value: `${packageName} teams members --format json`,
    },
    {
      name: 'Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch',
      value: `${packageName} teams members --next 1584722256178`,
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
    membersSubcommand,
  ],
  options: [],
  examples: [],
} as const;
