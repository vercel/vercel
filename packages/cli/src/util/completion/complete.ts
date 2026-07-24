import type {
  CommandArgument,
  CommandOption,
  CompletionSource,
} from '../../commands/help';

/**
 * Structural view of a command struct that the engine needs. Kept loose so the
 * real registry array (which mixes full commands with the bare `help` entry)
 * and test fixtures both satisfy it.
 */
export interface CompletionCommand {
  readonly name: string;
  readonly aliases?: ReadonlyArray<string>;
  readonly hidden?: true;
  readonly arguments?: ReadonlyArray<CommandArgument>;
  readonly options?: ReadonlyArray<CommandOption>;
  readonly subcommands?: ReadonlyArray<CompletionCommand>;
  readonly disabledGlobalOptions?: ReadonlyArray<string>;
}

export interface CompleteOptions {
  /** Top-level command structs (e.g. the registry's commandsStructs). */
  readonly commands: ReadonlyArray<CompletionCommand>;
  /** Options valid on every command (globalCommandOptions). */
  readonly globalOptions: ReadonlyArray<CommandOption>;
  /**
   * Resolves dynamic candidates for a source tag (e.g. team slugs). Omitted in
   * static tests so dynamic slots simply yield nothing.
   */
  readonly resolveSource?: (source: CompletionSource) => Promise<string[]>;
}

function matchesCommand(command: CompletionCommand, token: string): boolean {
  return command.name === token || (command.aliases?.includes(token) ?? false);
}

function optionTakesValue(option: CommandOption): boolean {
  const ctor = Array.isArray(option.type) ? option.type[0] : option.type;
  return ctor === String || ctor === Number;
}

function optionsFor(
  current: CompletionCommand | undefined,
  globalOptions: ReadonlyArray<CommandOption>
): CommandOption[] {
  const disabled = new Set(current?.disabledGlobalOptions ?? []);
  const globals = globalOptions.filter(option => !disabled.has(option.name));
  return [...(current?.options ?? []), ...globals];
}

function findOption(
  token: string,
  options: ReadonlyArray<CommandOption>
): CommandOption | undefined {
  if (token.startsWith('--')) {
    const name = token.slice(2).split('=')[0];
    return options.find(option => option.name === name);
  }
  if (token.startsWith('-') && token.length >= 2) {
    const shorthand = token[1];
    return options.find(option => option.shorthand === shorthand);
  }
  return undefined;
}

function positionalAt(
  current: CompletionCommand,
  index: number
): CommandArgument | undefined {
  const args = current.arguments ?? [];
  if (index < args.length) {
    return args[index];
  }
  // A trailing `multiple: true` argument keeps accepting further positionals.
  const last = args[args.length - 1];
  return last?.multiple ? last : undefined;
}

function filterPrefix(
  candidates: ReadonlyArray<string>,
  prefix: string
): string[] {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.startsWith(prefix)) {
      seen.add(candidate);
    }
  }
  return Array.from(seen).sort();
}

/**
 * Given the words a shell passes for completion (everything after the binary
 * name, with the final element being the partial word under the cursor),
 * returns the candidate completions. Command names, subcommands, and flags are
 * derived from the declarative command tree; dynamic slots (tagged with a
 * `completion` source) are resolved via `resolveSource`.
 */
export async function complete(
  words: ReadonlyArray<string>,
  opts: CompleteOptions
): Promise<string[]> {
  const { commands, globalOptions, resolveSource } = opts;
  const toComplete = words.length > 0 ? words[words.length - 1] : '';
  const committed = words.slice(0, -1);

  // Walk committed tokens to establish the current command and how many
  // positionals have been consumed, skipping options (and their values).
  let current: CompletionCommand | undefined;
  let positional = 0;
  // Set once a committed top-level token doesn't name a known command, so we
  // don't fall back to listing every command for an unknown/extension command.
  let unknownCommand = false;
  for (let i = 0; i < committed.length; i++) {
    const token = committed[i];
    if (token.startsWith('-')) {
      const option = findOption(token, optionsFor(current, globalOptions));
      if (option && optionTakesValue(option) && !token.includes('=')) {
        i++; // consume the option's value token
      }
      continue;
    }
    if (!current) {
      const command = commands.find(c => matchesCommand(c, token));
      if (command) {
        current = command;
      } else {
        unknownCommand = true;
      }
      continue;
    }
    if (
      current.subcommands &&
      current.subcommands.length > 0 &&
      positional === 0
    ) {
      const sub = current.subcommands.find(c => matchesCommand(c, token));
      if (sub) {
        current = sub;
        positional = 0;
        continue;
      }
    }
    positional++;
  }

  // An unknown command was committed: we can't know its flags or arguments, so
  // offer nothing rather than re-listing every top-level command.
  if (unknownCommand) {
    return [];
  }

  // (a) Value for a space-separated value-expecting option: `--scope <TAB>`.
  // Only the immediately-preceding token matters: a value-taking option consumes
  // exactly the next token, so `--scope <TAB>` has `--scope` last, while
  // `--scope acme --prod <TAB>` has the Boolean `--prod` last and falls through.
  const lastCommitted = committed[committed.length - 1];
  if (
    lastCommitted &&
    lastCommitted.startsWith('-') &&
    !lastCommitted.includes('=') &&
    !toComplete.startsWith('-')
  ) {
    const option = findOption(
      lastCommitted,
      optionsFor(current, globalOptions)
    );
    if (option && optionTakesValue(option)) {
      if (option.completion && resolveSource) {
        return filterPrefix(await resolveSource(option.completion), toComplete);
      }
      return [];
    }
  }

  // (b) `=`-joined option value: `--scope=ac<TAB>`.
  if (toComplete.startsWith('--') && toComplete.includes('=')) {
    const eq = toComplete.indexOf('=');
    const flag = toComplete.slice(0, eq);
    const partial = toComplete.slice(eq + 1);
    const option = findOption(flag, optionsFor(current, globalOptions));
    if (option?.completion && resolveSource) {
      const values = await resolveSource(option.completion);
      return values
        .filter(value => value.startsWith(partial))
        .sort()
        .map(value => `${flag}=${value}`);
    }
    return [];
  }

  // (c) Flag completion.
  if (toComplete.startsWith('-')) {
    const options = optionsFor(current, globalOptions).filter(
      option => !option.deprecated
    );
    const longs = options.map(option => `--${option.name}`);
    const shorts = options
      .filter(option => option.shorthand)
      .map(option => `-${option.shorthand}`);
    const candidates = toComplete.startsWith('--')
      ? longs
      : toComplete === '-'
        ? [...shorts, ...longs]
        : shorts;
    return filterPrefix(candidates, toComplete);
  }

  // (d) Command name, subcommand name, and/or positional value.
  if (!current) {
    const names = commands.filter(c => !c.hidden).map(c => c.name);
    return filterPrefix(names, toComplete);
  }
  const candidates: string[] = [];
  // At the first slot, visible subcommand names are candidates. A command can
  // also define a positional there (e.g. `completion` has both an `install`
  // subcommand and a `shell` argument), so both sets are offered together.
  if (
    current.subcommands &&
    current.subcommands.length > 0 &&
    positional === 0
  ) {
    candidates.push(
      ...current.subcommands.filter(c => !c.hidden).map(c => c.name)
    );
  }
  const arg = positionalAt(current, positional);
  if (arg?.values) {
    candidates.push(...arg.values);
  } else if (arg?.completion && resolveSource) {
    candidates.push(...(await resolveSource(arg.completion)));
  }
  return filterPrefix(candidates, toComplete);
}
