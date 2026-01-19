import type { Plugin } from 'rolldown';
import { build as rolldownBuild } from 'rolldown';
import { join, dirname, relative } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

export type TracedFile = {
  /** Absolute source path */
  sourcePath: string;
  /** Path relative to repoRootPath (for Files object) */
  relativePath: string;
};

export type WorkspaceOptions = {
  repoRootPath: string;
  outputDir: string;
  format: 'esm' | 'cjs';
};

const PLUGIN_NAME = 'cervel:workspace';

// Global storage for workspace files (accessible after build)
let lastWorkspaceFiles: TracedFile[] = [];

export function getWorkspaceFiles(): TracedFile[] {
  return lastWorkspaceFiles;
}

export function workspace(opts: WorkspaceOptions): Plugin {
  // Map of import name → source path
  const usedWorkspaces = new Map<string, string>();
  const workspaceFilesList: TracedFile[] = [];

  return {
    name: PLUGIN_NAME,

    async resolveId(id, importer, resolveOptions) {
      // Let other plugins/resolvers handle this first
      const resolved = await this.resolve(id, importer, {
        ...resolveOptions,
        skipSelf: true,
      });

      if (!resolved || resolved.external) {
        return resolved;
      }

      const resolvedPath = resolved.id;

      // Check if it's in the monorepo but NOT in node_modules
      const isInMonorepo = resolvedPath.startsWith(opts.repoRootPath);
      const isInNodeModules = resolvedPath.includes('/node_modules/');

      if (isInMonorepo && !isInNodeModules) {
        // This is a workspace package!
        // Only track it if it looks like a package import (not a relative path)
        if (!id.startsWith('.') && !id.startsWith('/')) {
          // Check if it's a TypeScript file that needs transpilation
          const isTypeScript = /\.(tsx?|mts|cts)$/.test(resolvedPath);

          if (isTypeScript) {
            usedWorkspaces.set(id, resolvedPath);
            return {
              id,
              external: true,
            };
          } else {
            // Already JavaScript - let Rolldown handle it normally
            return resolved;
          }
        }
      }

      return resolved;
    },

    async buildEnd() {
      if (usedWorkspaces.size === 0) {
        return;
      }

      console.log(
        `[${PLUGIN_NAME}] Transpiling ${usedWorkspaces.size} workspace packages...`
      );

      for (const [importName, sourcePath] of usedWorkspaces) {
        const files = await transpileWorkspacePackage(
          importName,
          sourcePath,
          opts.outputDir,
          opts.format,
          opts.repoRootPath
        );
        workspaceFilesList.push(...files);
      }

      // Store globally for access after build
      lastWorkspaceFiles = workspaceFilesList;

      console.log(
        `[${PLUGIN_NAME}] Workspace packages transpiled to node_modules`
      );
      console.log(
        `[${PLUGIN_NAME}] Tracked ${workspaceFilesList.length} workspace files for manifest`
      );
    },
  };
}

async function transpileWorkspacePackage(
  importName: string,
  sourcePath: string,
  outputDir: string,
  format: 'esm' | 'cjs',
  repoRootPath: string
): Promise<TracedFile[]> {
  // Determine the package directory (find the nearest package.json)
  let packageDir = dirname(sourcePath);
  while (packageDir !== '/' && !existsSync(join(packageDir, 'package.json'))) {
    packageDir = dirname(packageDir);
  }

  // Build output path in node_modules
  const outputPackageDir = join(outputDir, 'node_modules', importName);

  // Ensure output directory exists
  await mkdir(outputPackageDir, { recursive: true });

  // Transpile the package with Rolldown
  const extension = format === 'esm' ? 'mjs' : 'cjs';
  const tracedFiles: TracedFile[] = [];

  try {
    await rolldownBuild({
      input: sourcePath,
      cwd: packageDir,
      platform: 'node',
      // @ts-ignore
      tsconfig: true,
      output: {
        dir: outputPackageDir,
        format,
        entryFileNames: `index.${extension}`,
        preserveModules: true,
        sourcemap: false,
      },
    });

    // The result from rolldownBuild already includes write operation
    // Files are written during the build

    // Track the transpiled file
    const outputFilePath = join(outputPackageDir, `index.${extension}`);
    tracedFiles.push({
      sourcePath: outputFilePath,
      relativePath: relative(repoRootPath, outputFilePath),
    });

    // Create a minimal package.json for resolution
    const packageJson = {
      name: importName,
      type: format === 'esm' ? 'module' : 'commonjs',
      main: `index.${extension}`,
    };

    const packageJsonPath = join(outputPackageDir, 'package.json');
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Track the package.json
    tracedFiles.push({
      sourcePath: packageJsonPath,
      relativePath: relative(repoRootPath, packageJsonPath),
    });

    console.log(
      `[${PLUGIN_NAME}] Transpiled ${importName} → ${outputPackageDir}`
    );

    return tracedFiles;
  } catch (error) {
    console.error(`[${PLUGIN_NAME}] Failed to transpile ${importName}:`, error);
    throw error;
  }
}
