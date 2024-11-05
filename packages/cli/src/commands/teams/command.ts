import { packageName } from '../../util/pkg-name';
import { nextOption } from '../../util/arg-common';

export const addSubcommand = {
  name: 'add',
  aliases: ['create'],
  description: 'Create a new team',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: "Show all teams that you're a member of",
  arguments: [],
  options: [
    nextOption,
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
      name: 'Invite multiple members simultaneously',
      value: `${packageName} teams invite abc@vercel.com xyz@vercel.com`,
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
    switchSubcommand,
  ],
  options: [],
  examples: [],
} as const;
