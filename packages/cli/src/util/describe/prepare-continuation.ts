import type { FunctionOutput } from './prepare-functions';
import { Lambda } from '@vercel/build-utils';
import { validateBuildOutput } from './validate-build-output';
import { basename, dirname, join, relative, sep } from 'node:path';
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';

interface Params {
  destination: string;
  directory: string;
  functions: readonly Pick<FunctionOutput, 'directory'>[];
  manifest: Record<string, unknown>;
  outputDir: string;
  repoRootPath?: string;
}

export async function prepareContinuation(params: Params) {
  const {
    directory,
    outputDir,
    destination,
    manifest,
    repoRootPath = directory,
  } = params;

  const validateSource = await validateBuildOutput({
    directory,
    outputDir,
    repoRootPath,
  });
  const outputRoot = await realpath(outputDir);
  const functionDirectories = new Set(params.functions.map(fn => fn.directory));
  const functionAliases: { path: string; target: string }[] = [];
  await cp(outputDir, destination, {
    recursive: true,
    dereference: true,
    filter: async (path, target) => {
      const rel = relative(outputDir, path);
      if (
        basename(path) !== '.vc-config.json' &&
        rel
          .split(sep)
          .slice(0, -1)
          .some(segment => segment.endsWith('.func'))
      ) {
        return false;
      }
      if (
        functionDirectories.has(rel) &&
        (await lstat(path)).isSymbolicLink()
      ) {
        functionAliases.push({
          path: target,
          target: join(destination, relative(outputRoot, await realpath(path))),
        });
        return false;
      }
      return true;
    },
  });

  // Function aliases must share one Lambda in the Build Container. Rebase links
  // into the continuation so they remain valid after the original output moves.
  for (const { path, target } of functionAliases) {
    await mkdir(dirname(path), { recursive: true });
    await symlink(relative(dirname(path), target), path);
  }

  await writeFile(
    join(destination, 'provision.json'),
    JSON.stringify(manifest)
  );

  const manifests = new Set(await packageManifests(directory));
  if (repoRootPath !== directory) {
    for (const path of await packageManifests(repoRootPath))
      manifests.add(path);
  }

  for (const directory of functionDirectories) {
    const configPath = join(destination, directory, '.vc-config.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    for (const [file, source] of Object.entries(config.filePathMap ?? {})) {
      if (basename(file) === 'package.json') {
        manifests.add(join(repoRootPath, source as string));
      }
    }
    delete config.filePathMap;
    await writeFile(
      configPath,
      JSON.stringify({
        ...config,
        architecture: new Lambda({ ...config, files: {} }).architecture,
      })
    );
  }

  // Carry only package metadata into the continuation. External filePathMap
  // references depend on the upload cwd, which differs for workspace links.
  const [firstFunction] = functionDirectories;
  if (firstFunction === undefined) return;
  for (const [i, path] of [...manifests].entries()) {
    const target = join(
      destination,
      firstFunction,
      '__byoc_security__',
      String(i)
    );
    await mkdir(target, { recursive: true });
    await copyFile(await validateSource(path), join(target, 'package.json'));
  }
}

// The Build Container's dependency checks read each directory's package.json
// and its direct dependencies at node_modules/<name>/package.json, so only
// top-level packages are needed. Walking all of node_modules (including the
// pnpm store) would copy and upload thousands of unused manifests.
async function packageManifests(root: string) {
  const modules = join(root, 'node_modules');
  const names = await readdir(modules).catch(() => []);
  const packages = await Promise.all(
    names.map(async name => {
      if (name.startsWith('.')) return [];
      if (!name.startsWith('@')) return [join(modules, name)];
      const scoped = await readdir(join(modules, name)).catch(() => []);
      return scoped.map(entry => join(modules, name, entry));
    })
  );

  const found = await Promise.all(
    [root, ...packages.flat()].map(dir => {
      const path = join(dir, 'package.json');
      return stat(path).then(
        () => path,
        () => undefined
      );
    })
  );
  return found.filter((p): p is string => p !== undefined);
}
