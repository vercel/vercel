import {
  formatOption,
  jsonOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

const initSubcommand = {
  name: 'init',
  aliases: [],
  description:
    'Generate an AGENTS.md file with Vercel deployment best practices',
  arguments: [],
  options: [{ ...yesOption, description: 'Skip confirmation prompt' }],
  examples: [],
} as const;

export const agentCommand = {
  name: 'agent',
  aliases: [],
  summary: 'Chat with Vercel Agent about your projects',
  description:
    'Without a prompt, opens an interactive chat with Vercel Agent. With a prompt, prints the answer to stdout, so scripts and local coding agents can ask questions too.',
  runsWithoutSubcommand: true,
  arguments: [{ name: 'prompt', required: false }],
  subcommands: [initSubcommand],
  options: [
    {
      name: 'session',
      shorthand: null,
      type: String,
      argument: 'ID',
      deprecated: false,
      description: 'Continue a session',
    },
    {
      name: 'continue',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Continue the most recent session on the team',
    },
    {
      name: 'new',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        "Start a new session (a prompt otherwise continues this project's last session from the past 30 minutes)",
    },
    {
      name: 'approve',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Approve the plan waiting in the session',
    },
    {
      name: 'reject',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Reject the plan waiting in the session',
    },
    {
      ...projectOption,
      description: 'Project name or ID (default: linked project)',
    },
    { ...jsonOption, description: 'Print one JSON result object to stdout' },
    formatOption,
    {
      name: 'stream',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Print stream events as NDJSON to stdout',
    },
    { ...yesOption, description: 'Skip confirmation prompt (`init`)' },
  ],
  examples: [
    { name: 'Open an interactive chat', value: `${packageName} agent` },
    {
      name: 'Ask one question and print the answer',
      value: `${packageName} agent "why did my last deployment fail?"`,
    },
    {
      name: 'Pipe context into the question',
      value: `git diff | ${packageName} agent "will this break the build?"`,
    },
    {
      name: 'Answer a plan that is waiting for approval',
      value: `${packageName} agent --session <id> --approve`,
    },
    {
      name: 'Generate AGENTS.md with Vercel best practices',
      value: `${packageName} agent init`,
    },
  ],
} as const;
