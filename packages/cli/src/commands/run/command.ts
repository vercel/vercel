export const runCommand = {
  name: 'run',
  aliases: [],
  description:
    'Execute a command with environment variables from your linked project',
  arguments: [
    {
      name: 'command',
      required: true,
    },
    {
      name: '...args',
      required: false,
    },
  ],
  options: [
    {
      name: 'target',
      description: 'Environment target (production, preview, development)',
      argument: 'TARGET',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    {
      name: 'git-branch',
      description: 'Git branch name for environment variables',
      argument: 'BRANCH',
      shorthand: null,
      type: String,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Run npm dev with production environment variables',
      value: 'vercel run --target production npm run dev',
    },
    {
      name: 'Run a database migration with environment variables',
      value: 'vercel run node migrate.js',
    },
  ],
} as const;
