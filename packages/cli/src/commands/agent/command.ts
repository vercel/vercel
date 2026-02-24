import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const setupSubcommand = {
  name: 'setup',
  aliases: [] as const,
  description:
    'Create an AI agent OAuth app for the current project. Run this once so agents (e.g. Cursor) can use a dedicated token instead of your user token.',
  arguments: [],
  options: [
    {
      ...yesOption,
      description: 'Skip confirmation prompts when linking the project',
    },
  ],
  examples: [
    {
      name: 'Set up agent OAuth for the linked project',
      value: `${packageName} agent setup`,
    },
    {
      name: 'Non-interactive (e.g. in CI or when project is already linked)',
      value: `${packageName} agent setup --yes`,
    },
  ],
} as const;

export const agentCommand = {
  name: 'agent',
  aliases: [] as const,
  description:
    'Manage AI agent OAuth for this project. Use "setup" to create an agent OAuth app so agents use a dedicated token.',
  arguments: [],
  subcommands: [setupSubcommand],
  options: [
    {
      ...yesOption,
      description: 'Skip confirmation prompts (used by "agent setup")',
    },
  ],
  examples: [
    {
      name: 'Create an agent OAuth app for the current project',
      value: `${packageName} agent setup`,
    },
  ],
} as const;
