import { setupSubcommand } from '../ai-gateway/command';
import { packageName } from '../../util/pkg-name';

const description = 'Set up a coding agent with Vercel Token Pass';

export const tokenPassSetupSubcommand = {
  ...setupSubcommand,
  description,
  options: setupSubcommand.options.filter(
    option => option.name !== 'token-pass'
  ),
  examples: [
    {
      name: 'Set up OpenCode with Vercel Token Pass',
      value: `${packageName} token-pass setup --agent opencode --yes`,
    },
  ],
} as const;

export const tokenPassCommand = {
  ...tokenPassSetupSubcommand,
  name: 'token-pass',
  aliases: ['tokenpass'],
  runsWithoutSubcommand: true,
  subcommands: [tokenPassSetupSubcommand],
  examples: [
    {
      name: 'Set up detected coding agents with Vercel Token Pass',
      value: `${packageName} token-pass`,
    },
    {
      name: 'Set up OpenCode without prompts',
      value: `${packageName} token-pass --agent opencode --yes`,
    },
    {
      name: 'Preview Token Pass setup',
      value: `${packageName} token-pass --agent opencode --dry-run`,
    },
  ],
} as const;
