import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const overviewSubcommand = {
  name: 'overview',
  aliases: [],
  description:
    "Show a summary of your project's firewall configuration, including active rules, IP blocks, bypasses, and any unpublished draft changes",
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
      name: 'Show firewall overview',
      value: `${packageName} firewall overview`,
    },
  ],
} as const;

export const diffSubcommand = {
  name: 'diff',
  aliases: [],
  description:
    'Show draft changes that have been made but are not yet published to production',
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
      name: 'Show unpublished changes',
      value: `${packageName} firewall diff`,
    },
  ],
} as const;

export const publishSubcommand = {
  name: 'publish',
  aliases: [],
  description:
    'Publish all draft firewall changes to production, making them live immediately',
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
  description:
    'Permanently discard all unpublished draft changes, reverting to the current production configuration',
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

// System Bypass subcommands
export const systemBypassListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List all system bypass rules that allow specific IPs to skip firewall checks',
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
      name: 'List bypass rules',
      value: `${packageName} firewall system-bypass list`,
    },
  ],
} as const;

export const systemBypassAddSubcommand = {
  name: 'add',
  aliases: [],
  description:
    'Add a system bypass rule to allow a specific IP address to skip firewall checks',
  arguments: [{ name: 'ip', required: true }],
  options: [
    {
      name: 'domain',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Scope bypass to a specific domain (default: all domains)',
    },
    {
      name: 'notes',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Add a note to the bypass rule',
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Add a bypass for an IP (all domains)',
      value: `${packageName} firewall system-bypass add 10.0.0.1`,
    },
    {
      name: 'Add a bypass scoped to a domain',
      value: `${packageName} firewall system-bypass add 10.0.0.1 --domain example.com`,
    },
  ],
} as const;

export const systemBypassRemoveSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description:
    'Remove a system bypass rule so the IP is no longer exempt from firewall checks',
  arguments: [{ name: 'ip', required: true }],
  options: [
    {
      name: 'domain',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Scope removal to a specific domain',
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Remove a bypass rule',
      value: `${packageName} firewall system-bypass remove 10.0.0.1`,
    },
  ],
} as const;

export const systemBypassSubcommand = {
  name: 'system-bypass',
  aliases: [],
  description:
    'Manage system bypass rules that allow specific IPs to skip firewall checks',
  arguments: [],
  subcommands: [
    systemBypassListSubcommand,
    systemBypassAddSubcommand,
    systemBypassRemoveSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List bypass rules',
      value: `${packageName} firewall system-bypass list`,
    },
    {
      name: 'Add a bypass for an IP',
      value: `${packageName} firewall system-bypass add 10.0.0.1`,
    },
    {
      name: 'Remove a bypass',
      value: `${packageName} firewall system-bypass remove 10.0.0.1`,
    },
  ],
} as const;


// IP Blocks subcommands
export const ipBlocksListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List all IP blocking rules, including any unpublished draft changes',
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
      name: 'List IP blocking rules',
      value: `${packageName} firewall ip-blocks list`,
    },
  ],
} as const;

export const ipBlocksBlockSubcommand = {
  name: 'block',
  aliases: [],
  description: 'Block an IP address or CIDR range from accessing your project',
  arguments: [{ name: 'ip', required: true }],
  options: [
    {
      name: 'hostname',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Scope block to a specific hostname (default: * for all hosts)',
    },
    {
      name: 'notes',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Add a note to the block rule',
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Block an IP',
      value: `${packageName} firewall ip-blocks block 1.2.3.4`,
    },
    {
      name: 'Block a CIDR range with a note',
      value: `${packageName} firewall ip-blocks block 10.0.0.0/24 --notes "Suspicious range"`,
    },
    {
      name: 'Block scoped to a hostname',
      value: `${packageName} firewall ip-blocks block 1.2.3.4 --hostname example.com`,
    },
  ],
} as const;

export const ipBlocksUnblockSubcommand = {
  name: 'unblock',
  aliases: ['rm'],
  description:
    'Remove an IP blocking rule to allow the address to access your project again',
  arguments: [{ name: 'id-or-ip', required: true }],
  options: [yesOption],
  examples: [
    {
      name: 'Unblock by IP',
      value: `${packageName} firewall ip-blocks unblock 1.2.3.4`,
    },
    {
      name: 'Unblock by rule ID',
      value: `${packageName} firewall ip-blocks unblock ip_abc123`,
    },
  ],
} as const;

export const ipBlocksSubcommand = {
  name: 'ip-blocks',
  aliases: [],
  description:
    'Manage IP blocking rules that deny access from specific addresses or ranges',
  arguments: [],
  subcommands: [
    ipBlocksListSubcommand,
    ipBlocksBlockSubcommand,
    ipBlocksUnblockSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List IP blocking rules',
      value: `${packageName} firewall ip-blocks list`,
    },
    {
      name: 'Block an IP',
      value: `${packageName} firewall ip-blocks block 1.2.3.4`,
    },
    {
      name: 'Unblock an IP',
      value: `${packageName} firewall ip-blocks unblock 1.2.3.4`,
    },
  ],
} as const;

// Attack Mode subcommands
export const attackModeEnableSubcommand = {
  name: 'enable',
  aliases: [],
  description:
    'Enable attack mode — all visitors will be shown a verification challenge before accessing your site',
  arguments: [],
  options: [
    {
      name: 'duration',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Duration: 1h, 6h, or 24h (default: 1h)',
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Enable attack mode for 1 hour',
      value: `${packageName} firewall attack-mode enable`,
    },
    {
      name: 'Enable attack mode for 24 hours',
      value: `${packageName} firewall attack-mode enable --duration 24h`,
    },
  ],
} as const;

export const attackModeDisableSubcommand = {
  name: 'disable',
  aliases: [],
  description: 'Disable attack mode — visitors will no longer be challenged',
  arguments: [],
  options: [yesOption],
  examples: [
    {
      name: 'Disable attack mode',
      value: `${packageName} firewall attack-mode disable`,
    },
  ],
} as const;

export const attackModeSubcommand = {
  name: 'attack-mode',
  aliases: [],
  description:
    'Manage attack mode, which challenges all incoming requests with a verification page',
  arguments: [],
  subcommands: [attackModeEnableSubcommand, attackModeDisableSubcommand],
  options: [],
  examples: [
    {
      name: 'Enable attack mode',
      value: `${packageName} firewall attack-mode enable`,
    },
    {
      name: 'Disable attack mode',
      value: `${packageName} firewall attack-mode disable`,
    },
  ],
} as const;

// System Mitigations subcommands
export const systemMitigationsPauseSubcommand = {
  name: 'pause',
  aliases: [],
  description:
    'Pause automatic DDoS protection and system-level traffic filtering for 24 hours',
  arguments: [],
  options: [yesOption],
  examples: [
    {
      name: 'Pause system mitigations',
      value: `${packageName} firewall system-mitigations pause`,
    },
  ],
} as const;

export const systemMitigationsResumeSubcommand = {
  name: 'resume',
  aliases: [],
  description:
    'Resume automatic DDoS protection and system-level traffic filtering',
  arguments: [],
  options: [yesOption],
  examples: [
    {
      name: 'Resume system mitigations',
      value: `${packageName} firewall system-mitigations resume`,
    },
  ],
} as const;

export const systemMitigationsSubcommand = {
  name: 'system-mitigations',
  aliases: [],
  description:
    'Manage automatic DDoS protection and system-level traffic filtering',
  arguments: [],
  subcommands: [
    systemMitigationsPauseSubcommand,
    systemMitigationsResumeSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Pause system mitigations',
      value: `${packageName} firewall system-mitigations pause`,
    },
  ],
} as const;

export const firewallCommand = {
  name: 'firewall',
  aliases: [],
  description:
    "Manage your project's firewall rules, IP blocks, and system bypass configuration",
  hidden: true as const,
  arguments: [],
  subcommands: [
    overviewSubcommand,
    diffSubcommand,
    publishSubcommand,
    discardSubcommand,
    ipBlocksSubcommand,
    systemBypassSubcommand,
    attackModeSubcommand,
    systemMitigationsSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Show firewall overview',
      value: `${packageName} firewall overview`,
    },
    {
      name: 'Show unpublished changes',
      value: `${packageName} firewall diff`,
    },
    {
      name: 'Add a system bypass for an IP',
      value: `${packageName} firewall system-bypass add 10.0.0.1`,
    },
  ],
} as const;
