import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const verifySubcommand = {
  name: 'verify',
  aliases: [],
  description:
    'Run a verification manifest against a deployment and record the result',
  arguments: [
    {
      name: 'manifest',
      required: false,
    },
  ],
  options: [
    {
      name: 'deployment',
      shorthand: null,
      type: String,
      argument: 'URL',
      deprecated: false,
      description: 'Deployment to verify (overrides the manifest)',
    },
  ],
  examples: [
    {
      name: 'Run the checks in verify.json',
      value: `${packageName} onboard verify verify.json`,
    },
    {
      name: 'Verify a specific deployment',
      value: `${packageName} onboard verify verify.json --deployment https://my-app.vercel.app`,
    },
  ],
} as const;

export const onboardCommand = {
  name: 'onboard',
  aliases: [],
  description:
    'Use your AI coding agent to configure and deploy this app on Vercel',
  subcommands: [verifySubcommand],
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
      value: `${packageName} onboard`,
    },
    {
      name: 'Work in a different directory',
      value: `${packageName} onboard ./apps/store`,
    },
    {
      name: 'See which coding agents are installed',
      value: `${packageName} onboard --list-harnesses`,
    },
    {
      name: 'Pick a specific agent',
      value: `${packageName} onboard --harness codex`,
    },
    {
      name: 'Produce a plan without changing anything',
      value: `${packageName} onboard --dry-run`,
    },
    {
      name: 'Review the instructions sent to the agent',
      value: `${packageName} onboard --print-prompt`,
    },
    {
      name: 'Iterate on the instructions with a local file',
      value: `${packageName} onboard --prompt ./my-mission.md`,
    },
  ],
} as const;
