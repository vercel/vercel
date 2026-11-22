import { packageName } from '../../util/pkg-name';
import {
  formatOption,
  gitBranchOption,
  jsonOption,
  limitOption,
} from '../../util/arg-common';

// Hidden: `--branch` is the old name of `--git-branch`.
const branchOption = {
  name: 'branch',
  shorthand: null,
  type: String,
  argument: 'BRANCH',
  deprecated: true,
  description: 'Deprecated alias for `--git-branch`',
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List Vercel CI runs for the current repository',
  arguments: [],
  options: [
    {
      ...gitBranchOption,
      description:
        'Only list runs for this Git branch (default: the current branch)',
    },
    branchOption,
    {
      name: 'all-branches',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'List runs for every branch of the repository',
    },
    {
      name: 'commit',
      shorthand: null,
      type: String,
      argument: 'SHA',
      deprecated: false,
      description:
        'Only list runs for this commit on the current branch or --git-branch; cannot combine with --all-branches',
    },
    {
      name: 'status',
      shorthand: null,
      type: String,
      argument: 'STATUS',
      deprecated: false,
      description:
        'Only list runs with this status (queued, running, succeeded, failed, skipped)',
    },
    limitOption,
    {
      name: 'next',
      shorthand: null,
      type: String,
      argument: 'CURSOR',
      deprecated: false,
      description:
        'Show the next page using the cursor from the previous output',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'List runs for the current branch',
      value: `${packageName} ci list`,
    },
    {
      name: 'List failed runs across every branch',
      value: `${packageName} ci list --all-branches --status failed`,
    },
    {
      name: 'List runs as JSON',
      value: `${packageName} ci list --json`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description:
    'Show the jobs and tasks of a Vercel CI run (default: the run for the current commit)',
  arguments: [
    {
      name: 'run',
      required: false,
    },
  ],
  options: [
    {
      name: 'attempt',
      shorthand: null,
      type: Number,
      argument: 'NUMBER',
      deprecated: false,
      description: 'Show this attempt of the run (default: the latest attempt)',
    },
    {
      name: 'wait',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Wait up to 10 minutes for the run to finish, then exit with 1 if it failed. Stopping the wait does not cancel the run',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Show the run for the current commit',
      value: `${packageName} ci inspect`,
    },
    {
      name: 'Wait for the current commit to finish and exit with its result',
      value: `${packageName} ci inspect --wait`,
    },
    {
      name: 'Show a specific run as JSON',
      placeholders: ['<run>'],
      value: `${packageName} ci inspect <run> --json`,
    },
  ],
} as const;

export const CI_LOG_LEVELS = [
  'trace',
  'debug',
  'command',
  'info',
  'warn',
  'error',
  'systemError',
  'fatal',
] as const;

export const logsSubcommand = {
  name: 'logs',
  aliases: [],
  description:
    'Show task logs for a Vercel CI run (default: the run for the current commit)',
  arguments: [
    {
      name: 'run',
      required: false,
    },
  ],
  options: [
    {
      name: 'failed',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Only show logs for tasks that failed (cannot be combined with --follow)',
    },
    {
      name: 'task',
      shorthand: null,
      type: [String],
      argument: 'NAME',
      deprecated: false,
      description:
        'Only show logs for this task (e.g., web#test); can be repeated',
    },
    {
      name: 'level',
      shorthand: null,
      type: [String],
      argument: 'LEVEL',
      deprecated: false,
      description: `Only show log lines with this level (${CI_LOG_LEVELS.join(', ')}); can be repeated`,
    },
    {
      name: 'grep',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      deprecated: false,
      description:
        'Only show log lines containing this text, ignoring case. Searches every task in the run',
    },
    {
      name: 'attempt',
      shorthand: null,
      type: Number,
      argument: 'NUMBER',
      deprecated: false,
      description:
        'Show logs for this attempt of the run (default: the latest attempt)',
    },
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      argument: 'NUMBER',
      deprecated: false,
      description: 'Maximum number of tasks to show (default: 10, max: 25)',
    },
    {
      name: 'follow',
      shorthand: 'f',
      type: Boolean,
      deprecated: false,
      description:
        'Stream logs for one task (requires --task; JSON uses JSONL). Reconnect replay is bounded; stopping does not cancel the run',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Show logs for the failed tasks of the current commit',
      value: `${packageName} ci logs --failed`,
    },
    {
      name: 'Find every line mentioning a warning across the run',
      value: `${packageName} ci logs --grep WARNING`,
    },
    {
      name: 'Show only error lines for one task',
      value: `${packageName} ci logs --task web#test --level error --level fatal`,
    },
    {
      name: 'Stream a running task',
      placeholders: ['<run>'],
      value: `${packageName} ci logs <run> --task web#build --follow`,
    },
  ],
} as const;

export const rerunSubcommand = {
  descriptionTone: 'normal',
  name: 'rerun',
  aliases: [],
  description:
    'Start a new attempt of a finished Vercel CI run (default: a failed run for the current commit; succeeded or skipped runs require a run ID)',
  arguments: [
    {
      name: 'run',
      required: false,
    },
  ],
  options: [
    {
      name: 'wait',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Wait up to 10 minutes for the new attempt to finish, then exit with 1 if it failed. Stopping the wait does not cancel the run',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Rerun the run for the current commit',
      value: `${packageName} ci rerun`,
    },
    {
      name: 'Rerun a run and wait for the result',
      placeholders: ['<run>'],
      value: `${packageName} ci rerun <run> --wait`,
    },
  ],
} as const;

export const grepSubcommand = {
  name: 'grep',
  aliases: [],
  description:
    'Search the task logs of recent Vercel CI runs for the current repository (default: the last 20 runs on the current branch)',
  arguments: [
    {
      name: 'text',
      required: true,
    },
  ],
  options: [
    {
      ...gitBranchOption,
      description:
        'Search runs for this Git branch (default: the current branch)',
    },
    branchOption,
    {
      name: 'all-branches',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Search runs across every branch',
    },
    {
      name: 'status',
      shorthand: null,
      type: String,
      argument: 'STATUS',
      deprecated: false,
      description:
        'Only search runs whose latest attempt has this status (queued, running, succeeded, failed, skipped)',
    },
    {
      name: 'runs',
      shorthand: null,
      type: Number,
      argument: 'NUMBER',
      deprecated: false,
      description:
        'Maximum recent runs to search (default: 20, max: 50); bounded scans can return fewer runs with an explicit partial-result notice',
    },
    {
      name: 'level',
      shorthand: null,
      type: [String],
      argument: 'LEVEL',
      deprecated: false,
      description: `Only show log lines with this level (${CI_LOG_LEVELS.join(', ')}); can be repeated`,
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Search the recent runs of the current branch',
      value: `${packageName} ci grep ECONNRESET`,
    },
    {
      name: 'Search the last 50 failed runs across every branch',
      value: `${packageName} ci grep "out of memory" --all-branches --status failed --runs 50`,
    },
  ],
} as const;

export const enableSubcommand = {
  name: 'enable',
  aliases: [],
  description:
    'Enable Vercel CI for the current repository. The repository must be connected to a project on the current team',
  arguments: [],
  options: [
    {
      name: 'remote',
      shorthand: null,
      type: String,
      argument: 'NAME',
      deprecated: false,
      description:
        'Git remote to enable Vercel CI for (default: the only remote; prompts when multiple exist). Required with multiple remotes in non-interactive mode',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Enable Vercel CI for the current repository',
      value: `${packageName} ci enable`,
    },
    {
      name: 'Enable Vercel CI for a repository on another team',
      placeholders: ['<TEAM>'],
      value: `${packageName} ci enable --scope <TEAM>`,
    },
    {
      name: 'Enable Vercel CI for a specific Git remote without prompts',
      value: `${packageName} ci enable --remote upstream --non-interactive`,
    },
  ],
} as const;

export const ciCommand = {
  name: 'ci',
  aliases: [],
  description: 'Inspect Vercel CI and rerun runs',
  arguments: [],
  subcommands: [
    enableSubcommand,
    listSubcommand,
    inspectSubcommand,
    logsSubcommand,
    grepSubcommand,
    rerunSubcommand,
  ],
  options: [],
  examples: [],
} as const;
