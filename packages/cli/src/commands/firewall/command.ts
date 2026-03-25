import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const statusSubcommand = {
  name: 'status',
  aliases: [],
  description: 'Show firewall status and configuration overview',
  arguments: [],
  options: [
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
      name: 'Show firewall status',
      value: `${packageName} firewall status`,
    },
  ],
} as const;

export const schemaSubcommand = {
  name: 'schema',
  aliases: [],
  description:
    'List available firewall patch actions or dump the JSON schema for a specific action',
  arguments: [{ name: 'action', required: false }],
  options: [],
  examples: [
    {
      name: 'List all actions',
      value: `${packageName} firewall schema`,
    },
    {
      name: 'Show schema for creating a rule',
      value: `${packageName} firewall schema rules.insert`,
    },
  ],
} as const;

export const diffSubcommand = {
  name: 'diff',
  aliases: [],
  description: 'Show pending draft changes',
  arguments: [],
  options: [
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
      name: 'Show pending changes',
      value: `${packageName} firewall diff`,
    },
  ],
} as const;

export const publishSubcommand = {
  name: 'publish',
  aliases: [],
  description: 'Publish draft changes to production',
  arguments: [],
  options: [yesOption],
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
  description: 'Discard all draft changes',
  arguments: [],
  options: [yesOption],
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

export const firewallCommand = {
  name: 'firewall',
  aliases: [],
  description: 'Manage your project firewall configuration',
  hidden: true as const,
  arguments: [],
  subcommands: [
    statusSubcommand,
    schemaSubcommand,
    diffSubcommand,
    publishSubcommand,
    discardSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Show firewall status',
      value: `${packageName} firewall status`,
    },
    {
      name: 'Show pending changes',
      value: `${packageName} firewall diff`,
    },
    {
      name: 'Publish draft changes',
      value: `${packageName} firewall publish`,
    },
  ],
} as const;
