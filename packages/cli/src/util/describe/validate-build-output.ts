import Sema from 'async-sema';
import ignore from 'ignore';
import { basename, isAbsolute, join, relative, sep } from 'node:path';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { DescribeError } from './error';

function contains(root: string, path: string) {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function invalidSource(): never {
  throw new DescribeError(
    'invalid_build_output',
    'Build output references files outside the authorized output or includes excluded source files. Remove unsafe links and excluded file mappings, then rebuild.'
  );
}

// Match the prebuilt filePathMap policy in packages/client/src/utils/index.ts.
// This is local packaging policy; it must also check symlink targets because
// describe reads their contents rather than uploading the links themselves.
const vcs = ignore().add(['.hg', '.git', '.gitmodules', '.svn', 'CVS']);
const dependencies = ignore().add([
  'node_modules',
  '.next',
  '.yarn/cache',
  '.pnp*',
  '.venv',
  'venv',
  '__pycache__',
  '/target',
]);

async function readIgnore(root: string) {
  const read = (name: string) =>
    readFile(join(root, name), 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
  const [vercelignore, nowignore] = await Promise.all([
    read('.vercelignore'),
    read('.nowignore'),
  ]);
  if (vercelignore && nowignore) {
    throw new DescribeError(
      'invalid_build_output',
      'Cannot use both .vercelignore and .nowignore. Remove the deprecated .nowignore file and retry.'
    );
  }
  return ignore().add((vercelignore || nowignore).replace(/(\n|^)\.\//g, '$1'));
}

/**
 * Validate before the vendored readers dereference files or turn manifests into
 * blobs. Unlike an upload, those reads run with access to the operator's files.
 */
export async function validateBuildOutput(options: {
  directory?: string;
  outputDir: string;
  repoRootPath: string;
}) {
  const root = await realpath(options.repoRootPath);
  const output = await realpath(options.outputDir);
  const expectedOutput = join(
    root,
    relative(options.repoRootPath, options.outputDir)
  );
  // Resolving the repository root supports a symlinked checkout. The artifact
  // itself must not redefine its authorized tree by linking output elsewhere.
  if (!contains(root, output) || relative(expectedOutput, output) !== '') {
    invalidSource();
  }
  // The uploader reads the ignore file at its upload root, which can be the
  // repository root, a per-directory link, or the project's root directory.
  // Apply every ignore file from the repository root down to the project.
  const project = options.directory ? await realpath(options.directory) : root;
  const bases = [root];
  if (project !== root && contains(root, project)) {
    for (const segment of relative(root, project).split(sep)) {
      bases.push(join(bases[bases.length - 1], segment));
    }
  }
  const ignores = await Promise.all(
    bases.map(async base => ({ base, rules: await readIgnore(base) }))
  );

  // Outputs can hold hundreds of thousands of entries, so keep file system
  // calls in flight instead of awaiting them one at a time.
  const sema = new Sema(32);
  const limit = async <T>(fn: () => Promise<T>) => {
    await sema.acquire();
    try {
      return await fn();
    } finally {
      sema.release();
    }
  };

  const checkSource = async (path: string) => {
    const resolved = await limit(() => realpath(path));
    // Check both names: a dependency symlink must not bypass an ignore rule on
    // its target, and an ignored alias must not bypass a rule on its own name.
    for (const source of [
      join(root, relative(options.repoRootPath, path)),
      resolved,
    ]) {
      if (!contains(root, source)) invalidSource();
      const rel = relative(root, source).split(sep).join('/');
      if (!rel) continue;
      if (vcs.ignores(rel)) invalidSource();
      if (contains(output, source)) continue;
      for (const { base, rules } of ignores) {
        if (!contains(base, source)) continue;
        const relToBase = relative(base, source).split(sep).join('/');
        if (
          relToBase &&
          rules.ignores(relToBase) &&
          !dependencies.ignores(relToBase)
        ) {
          invalidSource();
        }
      }
    }
    return resolved;
  };
  // Functions usually map the same dependency files, so check each source
  // once rather than once per function that maps it.
  const checked = new Map<string, Promise<string>>();
  const validateSource = (path: string) => {
    let result = checked.get(path);
    if (!result) {
      result = checkSource(path);
      checked.set(path, result);
    }
    return result;
  };

  const configs: string[] = [];
  const visited = new Set<string>();
  // Resolve a directory's entries concurrently, but descend one directory at a
  // time. A link cycle is only caught where it points back at an ancestor, so
  // walking sibling directories at once could let each skip the other's half.
  async function walk(dir: string, ancestors: ReadonlySet<string>) {
    visited.add(dir);
    const next = new Set(ancestors).add(dir);
    const entries = await Promise.all(
      (await limit(() => readdir(dir))).map(async name => {
        const path = join(dir, name);
        const resolved = await limit(() => realpath(path));
        // Includes file links, directory links, and links in ancestor components.
        if (!contains(output, resolved) || next.has(resolved)) invalidSource();
        return { path, resolved, stats: await limit(() => stat(resolved)) };
      })
    );
    for (const { path, resolved, stats } of entries) {
      if (stats.isDirectory()) {
        if (!visited.has(resolved)) await walk(resolved, next);
      } else if (basename(path) === '.vc-config.json') {
        configs.push(resolved);
      }
    }
  }
  await walk(output, new Set());
  await Promise.all(
    configs.map(async path => {
      const config = JSON.parse(await limit(() => readFile(path, 'utf8')));
      await Promise.all(
        Object.values(config.filePathMap ?? {}).map(source => {
          if (typeof source !== 'string') invalidSource();
          return validateSource(join(options.repoRootPath, source));
        })
      );
    })
  );
  return validateSource;
}
