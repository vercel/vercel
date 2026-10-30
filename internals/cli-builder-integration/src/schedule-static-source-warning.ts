import { posix } from 'path';
import minimatch from 'minimatch';
import type { Builder } from '@vercel/build-utils';
import { isOfficialRuntime } from '@vercel/fs-detectors';

const LISTED_FILE_LIMIT = 3;

/**
 * Python sources that a static build publishes from the project root.
 *
 * Declared schedule entrypoints are excluded from the zero-config static
 * fallback, but the modules they import are not, and `outputDirectory: "."`
 * publishes every file. Only root-published output is checked: a build
 * output directory that contains `.py` files was chosen deliberately.
 */
export function getPublishedPythonSources(
  builds: Builder[],
  files: string[]
): string[] {
  const pythonFiles = files.filter(file => file.endsWith('.py'));
  const published = new Set<string>();
  for (const build of builds) {
    for (const file of getRootPublishedFiles(build, pythonFiles)) {
      published.add(file);
    }
  }
  return Array.from(published).sort();
}

function getRootPublishedFiles(build: Builder, files: string[]): string[] {
  const src = (build.src || '**').replace(/^\//, '');

  if (isOfficialRuntime('static', build.use)) {
    // The zero-config `public/` builder serves its own output directory.
    if (build.config?.outputDirectory) return [];
    return files.filter(
      file => file === src || minimatch(file, src, { dot: true })
    );
  }

  if (isOfficialRuntime('static-build', build.use)) {
    const { outputDirectory, distDir } = build.config ?? {};
    if (outputDirectory !== '.' && distDir !== '.') return [];
    // static-build resolves the output directory against its entrypoint.
    const root = posix.dirname(src);
    return root === '.'
      ? files
      : files.filter(file => file.startsWith(`${root}/`));
  }

  return [];
}

export function getPublishedPythonSourcesWarning(files: string[]): string {
  const subject =
    files.length === 1
      ? '1 Python file is published as a static file'
      : `${files.length} Python files are published as static files`;
  const pronoun = files.length === 1 ? 'it' : 'them';
  return (
    `${subject} and can be downloaded: ${formatFileList(files)}. ` +
    `To keep ${pronoun} private, set \`outputDirectory\` to a directory ` +
    'that only contains static files.'
  );
}

function formatFileList(files: string[]): string {
  const listed = files.slice(0, LISTED_FILE_LIMIT);
  const hidden = files.length - listed.length;
  const items = hidden > 0 ? [...listed, `${hidden} more`] : listed;
  const last = items.pop();
  if (items.length === 0) return last ?? '';
  const separator = items.length === 1 ? ' and ' : ', and ';
  return `${items.join(', ')}${separator}${last}`;
}
