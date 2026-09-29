/**
 * The process working directory as a runtime primitive.
 *
 * The live implementation keeps today's behaviour exactly: `current()` is
 * `process.cwd()` and `change()` is `process.chdir()`. Much legacy code reads
 * `process.cwd()` directly, so production runs must still chdir.
 */
export type WorkingDirectory = {
  current(): string;
  change(input: { dir: string }): void;
};

export function liveWorkingDirectory(): WorkingDirectory {
  return {
    current() {
      return process.cwd();
    },
    change({ dir }) {
      process.chdir(dir);
    },
  };
}
