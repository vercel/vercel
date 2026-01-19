import type { Plugin } from 'rolldown';
import { join, relative } from 'path';
import { builtinModules } from 'module';
import { existsSync, lstatSync } from 'fs';
import { readdir } from 'fs/promises';

export type TracedFile = {
  /** Absolute source path */
  sourcePath: string;
  /** Path relative to repoRootPath (for Files object) */
  relativePath: string;
};

export type ExternalsOptions = {
  rootDir: string;
  outputDir: string;
  repoRootPath: string;
};

const PLUGIN_NAME = 'cervel:externals';

// Global storage for traced files (accessible after build)
let lastTracedFiles: TracedFile[] = [];

export function getTracedFiles(): TracedFile[] {
  return lastTracedFiles;
}

export function externals(opts: ExternalsOptions): Plugin {
  const tracedPaths = new Set<string>();
  const tracedFilesList: TracedFile[] = [];

  return {
    name: PLUGIN_NAME,

    async resolveId(id, importer, resolveOptions) {
      // Skip built-in Node.js modules
      if (
        builtinModules.includes(id) ||
        builtinModules.includes(id.replace(/^node:/, ''))
      ) {
        return {
          id: id.startsWith('node:') ? id : `node:${id}`,
          external: true,
        };
      }

      // Let other plugins/resolvers handle this first
      const resolved = await this.resolve(id, importer, {
        ...resolveOptions,
        skipSelf: true,
      });

      if (!resolved || resolved.external) {
        return resolved;
      }

      const resolvedPath = resolved.id;

      // Check if it's in node_modules (npm package)
      const isInNodeModules = resolvedPath.includes('/node_modules/');

      if (isInNodeModules) {
        // This is an NPM package - externalize and track for tracing
        tracedPaths.add(resolvedPath);
        return {
          id,
          external: true,
        };
      }

      // Otherwise, let it be bundled (local files, workspace packages handled elsewhere)
      return resolved;
    },

    async buildEnd() {
      if (tracedPaths.size === 0) {
        return;
      }

      console.log(
        `[${PLUGIN_NAME}] Tracing ${tracedPaths.size} npm dependencies...`
      );

      try {
        // Use nf3's traceNodeModules which handles both tracing and copying
        const { traceNodeModules } = await import('nf3');

        await traceNodeModules([...tracedPaths], {
          outDir: opts.outputDir,
          rootDir: opts.rootDir,
          exportConditions: ['node', 'import'],
          writePackageJson: true,
          traceOptions: {
            base: '/',
            processCwd: opts.rootDir,
            exportsOnly: true,
          },
        });

        // Collect all the traced files from the output directory
        const nodeModulesDir = join(opts.outputDir, 'node_modules');

        if (existsSync(nodeModulesDir)) {
          const files = await collectFilesRecursive(
            nodeModulesDir,
            opts.repoRootPath
          );
          tracedFilesList.push(...files);

          console.log(
            `[${PLUGIN_NAME}] Traced and copied ${files.length} files to node_modules`
          );
        }

        // Store globally for access after build
        lastTracedFiles = tracedFilesList;
      } catch (error) {
        console.error(`[${PLUGIN_NAME}] Error during tracing:`, error);
        throw error;
      }
    },
  };
}

// Helper to recursively collect all files in a directory
async function collectFilesRecursive(
  dir: string,
  repoRootPath: string
): Promise<TracedFile[]> {
  const files: TracedFile[] = [];

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      try {
        // Use lstat to check what the entry actually is
        const stats = lstatSync(fullPath);

        if (stats.isDirectory()) {
          // Recurse into directories
          await walk(fullPath);
        } else if (stats.isFile() || stats.isSymbolicLink()) {
          // Add files and symlinks (even if symlink points to a directory, we track it)
          files.push({
            sourcePath: fullPath,
            relativePath: relative(repoRootPath, fullPath),
          });
        }
      } catch (error) {
        // Skip entries that we can't stat (broken symlinks, permission issues, etc.)
        console.warn(`[${PLUGIN_NAME}] Skipping ${fullPath}: ${error}`);
      }
    }
  }

  await walk(dir);
  return files;
}
