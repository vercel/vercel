import { projectOption } from '../../../util/arg-common';
import { packageName } from '../../../util/pkg-name';

export const forkSubcommand = {
  name: 'fork',
  aliases: [],
  description:
    'Fork an existing sandbox into a new one. Copies config (cpu, timeout, network policy, tags, etc.) from the source sandbox; env vars are NOT copied and must be re-supplied via --env.',
  arguments: [
    {
      name: 'source',
      required: true,
    },
  ],
  options: [
    {
      name: 'name',
      shorthand: null,
      type: String,
      argument: 'NAME',
      description:
        'A user-chosen name for the forked sandbox. Must be unique per project.',
      deprecated: false,
    },
    {
      name: 'non-persistent',
      shorthand: null,
      type: Boolean,
      description:
        'Disable automatic restore of the filesystem between sessions.',
      deprecated: false,
    },
    {
      name: 'timeout',
      shorthand: null,
      type: String,
      argument: 'DURATION',
      description:
        'Override the maximum sandbox runtime (inherited from source if omitted). Example: 5m, 30m',
      deprecated: false,
    },
    {
      name: 'vcpus',
      shorthand: null,
      type: Number,
      argument: 'COUNT',
      description:
        'Number of vCPUs to allocate (each vCPU includes 2048 MB of memory)',
      deprecated: false,
    },
    {
      name: 'publish-port',
      shorthand: 'p',
      type: [Number],
      argument: 'PORT',
      description: 'Publish sandbox port(s) to DOMAIN.vercel.run',
      deprecated: false,
    },
    {
      name: 'silent',
      shorthand: null,
      type: Boolean,
      description: "Don't write sandbox name to stdout",
      deprecated: false,
    },
    {
      name: 'connect',
      shorthand: null,
      type: Boolean,
      description:
        'Start an interactive shell session after creating the forked sandbox',
      deprecated: false,
    },
    {
      name: 'env',
      shorthand: 'e',
      type: [String],
      argument: 'KEY=VALUE',
      description:
        'Environment variables to set on the fork. Env vars from the source sandbox are not copied (encrypted server-side).',
      deprecated: false,
    },
    {
      name: 'tag',
      shorthand: null,
      type: [String],
      argument: 'KEY=VALUE',
      description:
        'Key-value tags to associate with the fork. When provided, fully replaces the tags copied from the source (no per-key merge).',
      deprecated: false,
    },
    {
      name: 'snapshot-expiration',
      shorthand: null,
      type: String,
      argument: 'DURATION',
      description:
        'Default snapshot expiration. Use "none" or 0 for no expiration. Example: 7d, 30d',
      deprecated: false,
    },
    {
      name: 'keep-last-snapshots',
      shorthand: null,
      type: Number,
      argument: 'COUNT',
      description:
        'Keep only the N most recent snapshots of this sandbox (1-10).',
      deprecated: false,
    },
    {
      name: 'keep-last-snapshots-for',
      shorthand: null,
      type: String,
      argument: 'DURATION',
      description:
        'Expiration applied to kept snapshots. Use "none" or 0 for no expiration. Example: 7d, 30d',
      deprecated: false,
    },
    {
      name: 'delete-evicted-snapshots',
      shorthand: null,
      type: String,
      argument: 'true|false',
      description:
        'When "true" (the default), evicted snapshots are deleted immediately; when "false", they keep the default expiration.',
      deprecated: false,
    },
    {
      name: 'network-policy',
      shorthand: null,
      type: String,
      argument: 'MODE',
      description:
        'Network policy mode: "allow-all" or "deny-all"\n  - allow-all: sandbox can access any website/domain\n  - deny-all: sandbox has no network access\nOmit this option and use --allowed-domain / --allowed-cidr / --denied-cidr for custom policies.',
      deprecated: false,
    },
    {
      name: 'allowed-domain',
      shorthand: null,
      type: [String],
      argument: 'DOMAIN',
      description:
        "Domain to allow traffic to (creates a custom network policy). Supports \"*\" for wildcards for a segment (e.g. '*.vercel.com', 'www.*.com'). If used as the first segment, will match any subdomain.",
      deprecated: false,
    },
    {
      name: 'allowed-cidr',
      shorthand: null,
      type: [String],
      argument: 'CIDR',
      description:
        "CIDR to allow traffic to (creates a custom network policy). Takes precedence over 'allowed-domain'.",
      deprecated: false,
    },
    {
      name: 'denied-cidr',
      shorthand: null,
      type: [String],
      argument: 'CIDR',
      description:
        'CIDR to deny traffic to (creates a custom network policy). Takes precedence over allowed domains/CIDRs.',
      deprecated: false,
    },
    projectOption,
  ],
  examples: [
    {
      name: 'Fork a sandbox with all config copied from the source',
      value: `${packageName} sandbox fork my-source`,
    },
    {
      name: 'Fork with a specific name and overridden vcpus',
      value: `${packageName} sandbox fork my-source --name my-forked-sandbox --vcpus 4`,
    },
  ],
} as const;
