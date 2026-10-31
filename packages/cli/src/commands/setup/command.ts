import { packageName } from '../../util/pkg-name';
import { formatOption, jsonOption, yesOption } from '../../util/arg-common';

const agentOption = {
  name: 'agent',
  shorthand: null,
  type: [String],
  argument: 'NAME',
  deprecated: false,
  description:
    'Select a coding agent (repeatable); plugin setup supports claude-code, codex, and opencode',
} as const;

const dryRunOption = {
  name: 'dry-run',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description: 'Show what would change without writing any files',
} as const;

export const pluginSubcommand = {
  name: 'plugin',
  aliases: [],
  description:
    'Install or update the Vercel plugin for Claude Code, Codex, and OpenCode',
  arguments: [],
  options: [
    {
      ...agentOption,
      description: 'Select claude-code, codex, or opencode (repeatable)',
    },
    dryRunOption,
    yesOption,
  ],
  examples: [
    {
      name: 'Install the Vercel plugin for every detected agent',
      value: `${packageName} setup plugin`,
    },
    {
      name: 'Install the Vercel plugin for Codex',
      value: `${packageName} setup plugin --agent codex`,
    },
  ],
} as const;

export const gatewaySubcommand = {
  name: 'gateway',
  aliases: [],
  description: 'Connect local coding agents to the AI Gateway',
  arguments: [],
  // The AI Gateway step's own options, so its recovery hints can be followed
  // with `vercel setup gateway`. Descriptions match `vercel ai-gateway setup`.
  options: [
    { ...agentOption, description: 'Select a coding agent (repeatable)' },
    {
      name: 'all',
      shorthand: 'a',
      type: Boolean,
      deprecated: false,
      description: 'Configure every supported coding agent',
    },
    {
      name: 'key',
      shorthand: null,
      type: String,
      argument: 'KEY',
      deprecated: false,
      description: 'Use an existing AI Gateway API key instead of creating one',
    },
    {
      name: 'reconfigure',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Re-run even if already configured, to rotate the key or switch team',
    },
    {
      name: 'no-session-migration',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Do not copy existing Codex Desktop sessions for use with the Vercel AI Gateway provider.',
    },
    dryRunOption,
    yesOption,
  ],
  examples: [
    {
      name: 'Connect detected coding agents to the AI Gateway',
      value: `${packageName} setup gateway`,
    },
    {
      name: 'Preview the AI Gateway changes for Claude Code',
      value: `${packageName} setup gateway --agent claude-code --dry-run`,
    },
  ],
} as const;

export const skillsSubcommand = {
  name: 'skills',
  aliases: [],
  description:
    'Write the vercel-cli agent skill that ships with this CLI version to ~/.agents/skills, or to --output',
  arguments: [],
  options: [
    {
      name: 'output',
      shorthand: 'o',
      type: String,
      argument: 'PATH',
      deprecated: false,
      description:
        'Directory to write the skill into (default: ~/.agents/skills/vercel-cli)',
    },
    {
      name: 'dry-run',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Show what would change without writing any files',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Write the Vercel CLI skill to ~/.agents/skills/vercel-cli',
      value: `${packageName} setup skills`,
    },
    {
      name: 'Update the skill after upgrading the CLI',
      value: `${packageName} setup skills`,
    },
    {
      name: 'Preview what would change',
      value: `${packageName} setup skills --dry-run`,
    },
    {
      name: 'Write the skill into a project or custom agent directory',
      value: `${packageName} setup skills --output .agents/skills/vercel-cli`,
    },
  ],
} as const;

export const setupCommand = {
  name: 'setup',
  aliases: [],
  summary: 'Set up coding agents for Vercel',
  description:
    'Set up your machine for Vercel: install the Vercel plugin for Claude Code, Codex, and OpenCode and connect local coding agents to the AI Gateway',
  arguments: [],
  // Bare `vercel setup` runs the plugin and AI Gateway steps.
  runsWithoutSubcommand: true,
  subcommands: [pluginSubcommand, gatewaySubcommand, skillsSubcommand],
  options: [
    {
      name: 'plugin',
      shorthand: null,
      type: Boolean,
      deprecated: true,
      description: 'DEPRECATED: Use `vercel setup plugin` instead',
    },
    {
      name: 'gateway',
      shorthand: null,
      type: Boolean,
      deprecated: true,
      description: 'DEPRECATED: Use `vercel setup gateway` instead',
    },
    agentOption,
    dryRunOption,
    yesOption,
  ],
  examples: [
    {
      name: 'Set up everything (prompts for each step)',
      value: `${packageName} setup`,
    },
    {
      name: 'Only connect coding agents to the AI Gateway',
      value: `${packageName} setup gateway`,
    },
    {
      name: 'Install the Vercel plugin for Codex',
      value: `${packageName} setup plugin --agent codex`,
    },
    {
      name: 'Preview what setup would change',
      value: `${packageName} setup --dry-run`,
    },
    {
      name: 'Run setup without prompts',
      value: `${packageName} setup --yes`,
    },
    {
      name: 'Write the Vercel CLI skill that matches this CLI version',
      value: `${packageName} setup skills`,
    },
  ],
} as const;
