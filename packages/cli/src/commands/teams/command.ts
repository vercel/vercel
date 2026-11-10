import { packageName } from '../../util/pkg-name';
import {
  formatOption,
  jsonOption,
  limitOption,
  nextCursorOption,
} from '../../util/arg-common';

export const requestSubcommand = {
  name: 'request',
  aliases: ['access-request'],
  description:
    'Show join-request status for the current team (default: the authenticated user)',
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
  name: 'create',
  aliases: ['add'],
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
      value: `${packageName} teams create`,
    },
    {
      name: 'Create a team non-interactively',
      value: `${packageName} teams create --slug acme --name "Acme Corp"`,
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: "Show all teams that you're a member of",
  arguments: [],
  options: [
    nextCursorOption,
    limitOption,
    formatOption,
    jsonOption,
    { name: 'since', shorthand: null, type: String, deprecated: true },
    { name: 'until', shorthand: null, type: String, deprecated: true },
    { name: 'count', shorthand: 'C', type: Number, deprecated: true },
  ],
  examples: [
    {
      name: 'Show the next page, using the cursor from the previous output',
      placeholders: ['<CURSOR>'],
      value: `${packageName} teams list --next <CURSOR>`,
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
      placeholders: ['<slug>'],
      value: `${packageName} teams switch <slug>`,
    },
  ],
  disabledGlobalOptions: ['token'],
} as const;

export const inviteSubcommand = {
  name: 'invite',
  aliases: [],
  description:
    'Invite a new member to a team (prompts for emails when none are given, except in non-interactive mode)',
  arguments: [
    {
      name: 'email',
      required: false,
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
  description: 'List, invite, or remove members from the current team',
  arguments: [],
  options: [nextCursorOption, limitOption, formatOption, jsonOption],
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
      name: 'Show the next page, using the cursor from the previous output',
      placeholders: ['<CURSOR>'],
      value: `${packageName} teams members --next <CURSOR>`,
    },
    {
      name: 'Invite a member to the currently scoped team',
      value: `${packageName} teams members invite user@example.com`,
    },
    {
      name: 'Remove a member from the currently scoped team',
      value: `${packageName} teams members remove user@example.com`,
    },
  ],
} as const;

export const membersInviteSubcommand = {
  name: 'members invite',
  aliases: [],
  description:
    'Invite members to the current team (prompts for emails when none are given, except in non-interactive mode)',
  arguments: [{ name: 'email', required: false, multiple: true }],
  options: [],
  examples: [
    {
      name: 'Invite a member',
      value: `${packageName} teams members invite user@example.com`,
    },
  ],
} as const;

export const membersRemoveSubcommand = {
  name: 'members remove',
  aliases: ['members rm'],
  description: 'Remove a member from the current team',
  arguments: [{ name: 'member', required: true }],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Remove a member',
      value: `${packageName} teams members remove user@example.com`,
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
  ],
  options: [],
  examples: [],
} as const;
