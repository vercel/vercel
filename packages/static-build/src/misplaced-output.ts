import path from 'path';
import { existsSync, readdirSync, statSync } from 'fs';

const IGNORED_DIRECTORY_NAMES = new Set(['node_modules']);
const MAX_DEPTH = 3;
const MAX_VISITED_DIRECTORIES = 2000;

export interface MisplacedOutput {
  /**
   * Path of the discovered output, relative to `workPath`
   * (e.g. "agent/.vercel/output" or "packages/api/.output").
   */
  outputPath: string;
  /**
   * Directory that produced the output, relative to `workPath`
   * ("" when the output was found at `workPath` itself).
   */
  rootDirectory: string;
}

function isDirectorySafe(dirPath: string): boolean {
  try {
    return statSync(dirPath).isDirectory();
  } catch (_e) {
    return false;
  }
}

/**
 * After a build completes without producing the expected Output Directory,
 * look for build output that landed somewhere else under `workPath` — either
 * Build Output API output (`.vercel/output/config.json`) or a directory with
 * the expected Output Directory name. This happens when the Build Command
 * runs the framework build in a different directory than the one Vercel
 * scans (e.g. an agent or app living in a subdirectory of the repository
 * without the project's Root Directory pointing at it).
 *
 * Returns the first match (breadth-first, so shallowest wins), or
 * `undefined` when nothing was found.
 */
export function findMisplacedOutput(
  workPath: string,
  distDirName: string,
  expectedDistDir: string
): MisplacedOutput | undefined {
  const queue: Array<{ dir: string; depth: number }> = [
    { dir: workPath, depth: 0 },
  ];
  let visited = 0;
  let distDirNameMatch: MisplacedOutput | undefined;

  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    if (visited++ >= MAX_VISITED_DIRECTORIES) {
      break;
    }

    const buildOutputConfig = path.join(
      dir,
      '.vercel',
      'output',
      'config.json'
    );
    if (existsSync(buildOutputConfig)) {
      return {
        outputPath: path.relative(
          workPath,
          path.join(dir, '.vercel', 'output')
        ),
        rootDirectory: path.relative(workPath, dir),
      };
    }

    const distDirCandidate = path.join(dir, distDirName);
    if (
      !distDirNameMatch &&
      path.resolve(distDirCandidate) !== path.resolve(expectedDistDir) &&
      isDirectorySafe(distDirCandidate)
    ) {
      distDirNameMatch = {
        outputPath: path.relative(workPath, distDirCandidate),
        rootDirectory: path.relative(workPath, dir),
      };
    }

    if (depth >= MAX_DEPTH) {
      continue;
    }

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
      continue;
    }

    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.name.startsWith('.') ||
        IGNORED_DIRECTORY_NAMES.has(entry.name)
      ) {
        continue;
      }
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }

  return distDirNameMatch;
}

/**
 * Builds the actionable sentence appended to the "No Output Directory"
 * error when misplaced build output was discovered.
 */
export function formatMisplacedOutputHint(misplaced: MisplacedOutput): string {
  const { outputPath, rootDirectory } = misplaced;
  if (rootDirectory === '') {
    return ` Build output was found at "${outputPath}" instead.`;
  }
  return (
    ` Build output was found at "${outputPath}" instead.` +
    ` If your application lives in "${rootDirectory}", set the project's Root Directory to "${rootDirectory}",` +
    ` or update the Build Command so the build runs at the Root Directory.`
  );
}
