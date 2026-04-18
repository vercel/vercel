import getSubcommand from '../get-subcommand';

type CommandConfig = {
  [command: string]: string[];
};

/**
 * Result when the first token matches a built-in {@link getSubcommand} entry.
 */
export type NativeSubcommandResolution = {
  kind: 'native';
  subcommand: string | string[];
  args: string[];
  subcommandOriginal: string;
};

/**
 * Result when the first token is not a built-in subcommand but should be treated
 * as an OpenAPI `operationId` under the resolved tag (e.g. `getProject` under `projects`).
 */
export type OpenApiSubcommandResolution = {
  kind: 'openapi';
  tag: string;
  operationId: string;
  positionalRest: string[];
};

/**
 * No native match and no OpenAPI delegation (missing tag in spec, empty token, or flag-like token).
 */
export type UnmatchedSubcommandResolution = {
  kind: 'unmatched';
  subcommand: undefined;
  args: string[];
  subcommandOriginal: string;
};

export type MergedSubcommandResolution =
  | NativeSubcommandResolution
  | OpenApiSubcommandResolution
  | UnmatchedSubcommandResolution;

/**
 * Merge native CLI subcommand resolution with OpenAPI tag/operationId inference.
 *
 * 1. Runs {@link getSubcommand} first — built-in subcommands always win.
 * 2. If there is no native match, the first token may be an OpenAPI `operationId`
 *    when `resolveOpenApiTag()` returns a tag (spec loaded, tag present).
 */
export async function resolveSubcommandWithOpenApi(
  cliArgsAfterParentCommand: string[],
  commandConfig: CommandConfig,
  resolveOpenApiTag: () => Promise<string | null>
): Promise<MergedSubcommandResolution> {
  const native = getSubcommand(cliArgsAfterParentCommand, commandConfig);

  if (native.subcommand != null) {
    return {
      kind: 'native',
      subcommand: native.subcommand,
      args: native.args,
      subcommandOriginal: native.subcommandOriginal,
    };
  }

  const head = cliArgsAfterParentCommand[0];
  if (!head || head.startsWith('-')) {
    return {
      kind: 'unmatched',
      subcommand: undefined,
      args: native.args,
      subcommandOriginal: native.subcommandOriginal,
    };
  }

  const tag = await resolveOpenApiTag();
  if (!tag) {
    return {
      kind: 'unmatched',
      subcommand: undefined,
      args: native.args,
      subcommandOriginal: native.subcommandOriginal,
    };
  }

  return {
    kind: 'openapi',
    tag,
    operationId: head,
    positionalRest: cliArgsAfterParentCommand.slice(1),
  };
}
