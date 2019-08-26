import path from 'path';
import _glob from 'glob';
import fs from 'fs-extra';
import plural from 'pluralize';
import { promisify } from 'util';
import npa from 'npm-package-arg';
import {
  detectBuilders,
  Builder,
  FileFsRef,
  PackageJson
} from '@now/build-utils';
import runBuild from './run-build';
import { NowContext } from '../../types';
import createOutput, { Output } from '../../util/output';
import { getAllProjectFiles } from '../../util/get-files';
import { getYarnPath } from '../../util/dev/yarn-installer';
import { installBuilders } from '../../util/dev/builder-cache';

const glob = promisify(_glob);

const cwd = process.cwd();
const outputDir = path.join(cwd, '.now');
const workDir = path.join(outputDir, 'workDir');
const buildersDir = path.join(outputDir, '/builders');
const buildsOutputDir = path.join(outputDir, 'builds');

async function getBuilds(
  files: string[],
  output: Output
): Promise<Builder[] | null> {
  let nowJson;
  let builds;

  try {
    nowJson = await fs.readJson(path.join(cwd, 'now.json'));
    builds = nowJson.builds;
  } catch (err) {
    output.debug('No now.json found, assuming zero-config');
  }

  // if no builds defined, should be zero-config
  if (!Array.isArray(builds) || builds.length === 0) {
    let pkg;
    try {
      pkg = await fs.readJson(path.join(cwd, 'package.json'));
    } catch (err) {
      output.debug('No package.json found');
    }
    builds = (await detectBuilders(files, pkg)).builders;
  }

  return builds;
}

export default async function main(ctx: NowContext) {
  const debug = ctx.argv.some(arg => arg === '-d' || arg === '--debug');
  const onlyArgIdx = ctx.argv.indexOf('--only');
  const onlyBuild =
    onlyArgIdx !== -1 && ctx.argv[ctx.argv.indexOf('--only') + 1];

  const output = createOutput({ debug });
  output.log('Setting up builds...');

  const files = (await getAllProjectFiles(cwd, output))
    .concat(
      // getAllProjectFiles doesn't include dotfiles (.babelrc) so grab those
      (await glob('**/.*', { cwd, nodir: true })).map(f =>
        f.replace(/\\/g, '/')
      )
    )
    .filter(file => {
      return !file.startsWith('node_modules') && !file.startsWith('.now');
    });

  const fileRefs: { [filePath: string]: FileFsRef } = {};

  for (const fsPath of files) {
    const relPath = path.relative(cwd, fsPath);
    const { mode } = await fs.stat(fsPath);
    fileRefs[relPath] = new FileFsRef({ mode, fsPath });
  }
  let builds = await getBuilds(files, output);

  if (builds && onlyBuild) {
    output.debug(`Filtering by src: ${onlyBuild}`);
    builds = builds.filter(build => build.src === onlyBuild);
  }
  if (!builds || builds.length === 0) {
    return output.warn('No builds found');
  }
  output.log(`Found ${plural('build', builds.length, true)}`);
  output.debug(`builds: ${JSON.stringify(builds)}`);

  output.log('Installing builders');
  const yarnDir = await getYarnPath(output);
  const packagesSet = new Set<string>(builds.map(build => build.use));
  const buildersPkgPath = path.join(buildersDir, 'package.json');
  let buildersPkg: PackageJson = {
    name: 'builders',
    dependencies: {},
    version: '0.0.1'
  };

  await fs.ensureDir(buildersDir);
  await fs.writeFile(buildersPkgPath, JSON.stringify(buildersPkg), 'utf8');
  await installBuilders(packagesSet, yarnDir, output, buildersDir, false);

  buildersPkg = await fs.readJSON(buildersPkgPath);
  const { dependencies = {} } = buildersPkg;
  const dependenciesKeys = Object.keys(dependencies);

  const normalizedBuilds: Builder[] = builds.map(build => {
    let use: string | undefined = build.use;
    const pkgInfo = npa(build.use);

    if (pkgInfo.name) {
      use = pkgInfo.name;
    } else {
      use = dependenciesKeys.find(key => dependencies[key] === build.use);
    }

    if (!use) {
      throw new Error(
        `Failed to normalize builders, couldn't find matching builder name for ${
          build.use
        }`
      );
    }
    return {
      use,
      src: build.src
    };
  });

  await fs.ensureDir(workDir);
  await fs.ensureDir(buildsOutputDir);

  const filesToPersist = new Set([
    'node_modules',
    'package.json',
    'yarn.lock',
    'package-log.json'
  ]);

  // Run the builds
  for (const build of normalizedBuilds) {
    for (const file of await fs.readdir(workDir)) {
      if (filesToPersist.has(file)) continue;
      await fs.remove(path.join(workDir, file));
    }

    await runBuild({
      output,
      workDir,
      buildersDir,
      buildsOutputDir,
      build,
      files: fileRefs
    });
  }
}
