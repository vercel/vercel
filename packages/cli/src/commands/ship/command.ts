import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const shipCommand = {
  name: 'ship',
  aliases: [],
  description:
    'Use your AI coding agent to configure and deploy this app on Vercel',
  arguments: [
    {
      name: 'path',
      required: false,
    },
  ],
  options: [
    {
      name: 'harness',
      shorthand: null,
      type: String,
      argument: 'HARNESS',
      deprecated: false,
      description:
        'Coding agent to drive the session (claude-code, codex, opencode, pi, deepagents)',
    },
    {
      name: 'list-harnesses',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'List detected coding agents and exit',
    },
    {
      name: 'print-prompt',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Print the composed agent instructions and exit',
    },
    {
      name: 'prompt',
      shorthand: null,
      type: String,
      argument: 'FILE',
      deprecated: false,
      description: 'Use instructions from FILE instead of the built-in ones',
    },
    {
      name: 'verbose',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        "Print the agent's reasoning in full instead of collapsing it",
    },
    {
      name: 'dry-run',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Let the agent inspect the project and produce a plan without changing anything',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output results as JSON (with --list-harnesses)',
    },
    {
      name: 'format',
      shorthand: null,
      type: String,
      argument: 'FORMAT',
      deprecated: false,
    },
    yesOption,
  ],
  examples: [
    {
      name: 'Configure and deploy the current directory',
      value: `${packageName} ship`,
    },
    {
      name: 'Work in a different directory',
      value: `${packageName} ship ./apps/store`,
    },
    {
      name: 'See which coding agents are installed',
      value: `${packageName} ship --list-harnesses`,
    },
    {
      name: 'Pick a specific agent',
      value: `${packageName} ship --harness codex`,
    },
    {
      name: 'Produce a plan without changing anything',
      value: `${packageName} ship --dry-run`,
    },
    {
      name: 'Review the instructions sent to the agent',
      value: `${packageName} ship --print-prompt`,
    },
    {
      name: 'Iterate on the instructions with a local file',
      value: `${packageName} ship --prompt ./my-mission.md`,
    },
  ],
} as const;
