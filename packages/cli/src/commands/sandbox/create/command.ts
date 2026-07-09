import { projectOption } from '../../../util/arg-common';
import { packageName } from '../../../util/pkg-name';

export const createSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create a sandbox in the specified account and project.',
  arguments: [],
  options: [
    {
      name: 'name',
      shorthand: null,
      type: String,
      argument: 'NAME',
      description:
        'A user-chosen name for the sandbox. It must be unique per project.',
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
      name: 'runtime',
      shorthand: null,
      type: String,
      argument: 'RUNTIME',
      description:
        'The sandbox runtime: node22, node24, node26, or python3.13. Defaults to node24 when --image is not set.',
      deprecated: false,
    },
    {
      name: 'image',
      shorthand: null,
      type: String,
      argument: 'IMAGE',
      description:
        'A Vercel Container Registry (VCR) image name and optional tag or sha to start the sandbox from (e.g. my-repo, my-repo:v1).',
      deprecated: false,
    },
    {
      name: 'timeout',
      shorthand: null,
      type: String,
      argument: 'DURATION',
      description:
        'The maximum duration a sandbox can run for. Example: 5m, 30m',
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
      name: 'snapshot',
      shorthand: 's',
      type: String,
      argument: 'SNAPSHOT_ID',
      description: 'Start the sandbox from a snapshot ID',
      deprecated: false,
    },
    {
      name: 'connect',
      shorthand: null,
      type: Boolean,
      description:
        'Start an interactive shell session after creating the sandbox',
      deprecated: false,
    },
    {
      name: 'env',
      shorthand: 'e',
      type: [String],
      argument: 'KEY=VALUE',
      description: 'Default environment variables for sandbox commands',
      deprecated: false,
    },
    {
      name: 'tag',
      shorthand: null,
      type: [String],
      argument: 'KEY=VALUE',
      description:
        'Key-value tags to associate with the sandbox (e.g. --tag env=staging)',
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
      name: 'Create a sandbox with the default runtime',
      value: `${packageName} sandbox create`,
    },
    {
      name: 'Create and connect to a sandbox with no network access',
      value: `${packageName} sandbox create --network-policy=deny-all --connect`,
    },
    {
      name: 'Create a sandbox from a custom image with a published port',
      value: `${packageName} sandbox create --image my-repo:v1 --publish-port 3000`,
    },
  ],
} as const;
