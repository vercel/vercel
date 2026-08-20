import { packageName } from '../../util/pkg-name';

export const askCommand = {
  name: 'ask',
  aliases: [],
  description: 'Ask Vercel Agent a question and wait for the answer',
  arguments: [
    {
      name: 'prompt',
      required: false,
    },
  ],
  options: [
    {
      name: 'session',
      shorthand: null,
      type: String,
      argument: 'ID',
      deprecated: false,
      description: 'Send the prompt into an existing agent session',
    },
    {
      name: 'no-wait',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Dispatch the prompt and exit immediately without waiting for the answer',
    },
    {
      name: 'verbose',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Render the agent reasoning and tool activity while it works',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output the agent turn as a JSON Lines stream of parts',
    },
  ],
  examples: [
    {
      name: 'Ask the agent a question and wait for the answer',
      value: `${packageName} ask "Why did my last deployment fail?"`,
    },
    {
      name: 'Send a follow-up prompt into an existing session',
      value: `${packageName} ask --session <id> "Can you fix it?"`,
    },
    {
      name: 'Dispatch a prompt without waiting for the answer',
      value: `${packageName} ask --no-wait "Audit my project for slow functions"`,
    },
    {
      name: 'Wait for and print the answer of a dispatched session',
      value: `${packageName} ask --session <id>`,
    },
    {
      name: 'Stream every part of the agent turn as JSON Lines',
      value: `${packageName} ask --json "What changed in my last deployment?"`,
    },
  ],
} as const;
