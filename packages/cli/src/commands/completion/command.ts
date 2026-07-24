import { packageName } from '../../util/pkg-name';
import { SUPPORTED_SHELLS } from '../../util/completion/scripts';

// Internal driver invoked by the generated shell scripts. Hidden from help and
// from completion of `completion`'s own subcommands.
export const completeSubcommand = {
  name: '__complete',
  aliases: [],
  hidden: true,
  description: 'Emit completion candidates for the given words (internal)',
  arguments: [{ name: 'words', required: false, multiple: true }],
  options: [],
  examples: [],
} as const;

export const installSubcommand = {
  name: 'install',
  aliases: [],
  description:
    'Install the completion script into your shell (auto-detects the shell)',
  arguments: [{ name: 'shell', required: false, values: SUPPORTED_SHELLS }],
  options: [],
  examples: [
    {
      name: 'Install completion for your current shell',
      value: `${packageName} completion install`,
    },
    {
      name: 'Install completion for a specific shell',
      value: `${packageName} completion install zsh`,
    },
  ],
} as const;

export const completionCommand = {
  name: 'completion',
  aliases: [],
  description: 'Generate a shell completion script (bash, zsh, or fish)',
  arguments: [
    {
      name: 'shell',
      required: true,
      values: SUPPORTED_SHELLS,
    },
  ],
  subcommands: [installSubcommand, completeSubcommand],
  options: [],
  examples: [
    {
      name: 'Install completion into your shell (recommended)',
      value: `${packageName} completion install`,
    },
    {
      name: 'Load completions in the current bash session',
      value: `source <(${packageName} completion bash)`,
    },
    {
      name: 'Load completions in the current zsh session',
      value: `source <(${packageName} completion zsh)`,
    },
    {
      name: 'Load completions in the current fish session',
      value: `${packageName} completion fish | source`,
    },
  ],
} as const;
