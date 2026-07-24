export const SUPPORTED_SHELLS = ['bash', 'zsh', 'fish'] as const;
export type SupportedShell = (typeof SUPPORTED_SHELLS)[number];

export function isSupportedShell(value: string): value is SupportedShell {
  return (SUPPORTED_SHELLS as ReadonlyArray<string>).includes(value);
}

/**
 * Each script is a thin wrapper: it collects the command-line tokens (including
 * the empty partial word under the cursor) and delegates to
 * `<binary> completion __complete -- <tokens>`, which prints newline-separated
 * candidates. All completion logic lives in the binary so the command tree
 * never drifts. `binary` is the canonical bin name; both `vercel` and `vc`
 * (always installed together) are registered.
 */

function bashScript(binary: string): string {
  return `# ${binary} bash completion
_${binary}_completion() {
  local cur tokens completions
  cur="\${COMP_WORDS[COMP_CWORD]}"
  # Tokens after the program name, up to and including the current word.
  tokens=("\${COMP_WORDS[@]:1:COMP_CWORD}")
  completions="$(${binary} completion __complete -- "\${tokens[@]}" 2>/dev/null)"
  local IFS=$'\\n'
  COMPREPLY=($(compgen -W "\${completions}" -- "\${cur}"))
}
complete -o default -F _${binary}_completion ${binary}
complete -o default -F _${binary}_completion vc
`;
}

/**
 * Dual-mode zsh script. As an autoloaded `#compdef` file on $fpath it is invoked
 * directly as the `_vercel` completion widget; when sourced (e.g.
 * `eval "$(vercel completion zsh)"`) it registers itself with `compdef`. The
 * `funcstack` check distinguishes the two, following the widely-used rustup/
 * docker pattern.
 */
function zshScript(binary: string): string {
  return `#compdef ${binary} vc
_${binary}() {
  local -a tokens completions
  # words[1] is the program; slice preserves the (possibly empty) current word.
  tokens=("\${(@)words[2,CURRENT]}")
  local out
  out="$(${binary} completion __complete -- "\${tokens[@]}" 2>/dev/null)"
  completions=("\${(@f)out}")
  compadd -- "\${completions[@]}"
}
if [ "$funcstack[1]" = "_${binary}" ]; then
  _${binary} "$@"
else
  compdef _${binary} ${binary} vc
fi
`;
}

function fishScript(binary: string): string {
  return `# ${binary} fish completion
function __${binary}_completion
  set -l tokens (commandline -opc)
  set -l current (commandline -ct)
  # $tokens[2..-1] drops the program name. Quote $current so an empty word
  # (cursor after a space) still contributes one empty argument; unquoted, an
  # empty fish variable expands to zero arguments and the word would be lost.
  set -l args $tokens[2..-1] "$current"
  ${binary} completion __complete -- $args 2>/dev/null
end
complete -c ${binary} -a '(__${binary}_completion)'
complete -c vc -a '(__${binary}_completion)'
`;
}

export function completionScript(
  shell: SupportedShell,
  binary: string
): string {
  switch (shell) {
    case 'bash':
      return bashScript(binary);
    case 'zsh':
      return zshScript(binary);
    case 'fish':
      return fishScript(binary);
  }
}
