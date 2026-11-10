import type Client from '../../util/client';
import type { CommandOption } from '../help';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { warnDeprecatedInput } from '../../util/warn-deprecated-subcommand';

// `-e` and `-b` are the old short forms of `--env` and `--build-env`. Help no
// longer lists them, because `-e` means `--environment` in every other
// command, but they keep working with a warning.
const DEPRECATED_SHORTHANDS = {
  '-e': '--env',
  '-b': '--build-env',
} as const;

export function getDeployFlagsSpecification<
  T extends ReadonlyArray<CommandOption>,
>(options: T) {
  return { ...getFlagsSpecification(options), ...DEPRECATED_SHORTHANDS };
}

/**
 * Warns for each deprecated short flag in argv. The real parse maps them
 * straight to `--env` and `--build-env`, so this parses again with each one
 * as its own key to see which spelling was used.
 */
export function warnDeprecatedShorthands(
  client: Client,
  options: ReadonlyArray<CommandOption>
) {
  let flags: Record<string, unknown>;
  try {
    ({ flags } = parseArguments(
      client.argv.slice(2),
      { ...getFlagsSpecification(options), '-e': [String], '-b': [String] },
      { permissive: true }
    ));
  } catch {
    return;
  }
  for (const [shorthand, name] of Object.entries(DEPRECATED_SHORTHANDS)) {
    if (flags[shorthand] !== undefined) {
      warnDeprecatedInput(client, shorthand, name);
    }
  }
}
