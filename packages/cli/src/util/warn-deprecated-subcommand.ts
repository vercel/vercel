import type Client from './client';
import output from '../output-manager';
import { wantsMachineReadableOutput } from './output-format';
import { getCommandName } from './pkg-name';

/**
 * Warns that a subcommand was invoked by a deprecated name, e.g.
 * `vercel webhooks get` instead of `vercel webhooks inspect`.
 * The old name keeps working; this only points users at the new one.
 * Skipped with `--json` so stderr stays clean for machine-readable output;
 * telemetry still records which name was used.
 */
export function warnDeprecatedSubcommand(
  client: Client,
  deprecated: string,
  replacement: string
) {
  if (wantsMachineReadableOutput(undefined, client.argv)) {
    return;
  }
  output.warning(
    `${getCommandName(deprecated)} is deprecated. Use ${getCommandName(replacement)}.`
  );
}

/**
 * Warns that a hidden, deprecated option was used, e.g. `--cursor` instead of
 * `--next`. Like `warnDeprecatedSubcommand`, it's skipped with `--json` so
 * stderr stays clean, and the option keeps working.
 */
export function warnDeprecatedOption(
  argv: readonly string[],
  deprecated: string,
  replacement: string
) {
  if (wantsMachineReadableOutput(undefined, argv)) {
    return;
  }
  output.warning(`${deprecated} is deprecated. Use ${replacement}.`);
}

/**
 * Warns that an option or argument was given in a deprecated form, e.g.
 * `--target` instead of `--environment`. The old form keeps working; this only
 * points users at the new one. Skipped with `--json`, like
 * `warnDeprecatedSubcommand`.
 */
export function warnDeprecatedInput(
  client: Client,
  deprecated: string,
  replacement: string
) {
  if (wantsMachineReadableOutput(undefined, client.argv)) {
    return;
  }
  output.warning(`${deprecated} is deprecated. Use ${replacement}.`);
}
