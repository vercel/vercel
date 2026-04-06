import type { Command } from '../commands/help';

export type RootCommandEntry =
  | Command
  | (Pick<Command, 'name'> & {
      readonly aliases: ReadonlyArray<string>;
    });

function isFullCommand(cmd: RootCommandEntry): cmd is Command {
  return (
    'description' in cmd &&
    typeof (cmd as Command).description === 'string' &&
    'arguments' in cmd &&
    'options' in cmd
  );
}

function walkCommandPaths(cmd: Command, prefix: string[]): string[] {
  const segments = [...prefix, cmd.name];
  const line = segments.join(' ');
  const paths = [line];
  for (const sub of cmd.subcommands ?? []) {
    paths.push(...walkCommandPaths(sub, segments));
  }
  return paths;
}

export function buildSortedCommandSurface(
  roots: ReadonlyArray<RootCommandEntry>
): readonly string[] {
  const collected: string[] = [];
  for (const root of roots) {
    if (isFullCommand(root)) {
      collected.push(...walkCommandPaths(root, []));
    } else {
      collected.push(root.name);
    }
  }
  return [...new Set(collected)].sort((a, b) => a.localeCompare(b));
}
