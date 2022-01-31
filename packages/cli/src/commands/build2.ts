import fs from 'fs-extra';
import chalk from 'chalk';
import npa from 'npm-package-arg';
import { dirname, join, relative } from 'path';
import {
  detectBuilders,
  Files,
  FileFsRef,
  PackageJson,
  spawnAsync,
  BuildOptions,
  Config,
  Builder,
  //Lambda,
} from '@vercel/build-utils';
import { VercelConfig } from '@vercel/client';

import pull from './pull';
import { staticFiles as getFiles } from '../util/get-files';
import Client from '../util/client';
import getArgs from '../util/get-args';
import cmd from '../util/output/cmd';
import * as cli from '../util/pkg-name';
import readJSONFile from '../util/read-json-file';
import { CantParseJSONFile } from '../util/errors-ts';
import { readProjectSettings } from '../util/projects/project-settings';
import { VERCEL_DIR } from '../util/projects/link';
import confirm from '../util/input/confirm';
import { emoji, prependEmoji } from '../util/emoji';
import stamp from '../util/output/stamp';

const help = () => {
  return console.log(`
   ${chalk.bold(`${cli.logo} ${cli.name} build`)}
  
   ${chalk.dim('Options:')}
  
      -h, --help                     Output usage information
      -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
      -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
      --cwd [path]                   The current working directory
      -d, --debug                    Debug mode [off]
      -y, --yes                      Skip the confirmation prompt
  
    ${chalk.dim('Examples:')}
  
    ${chalk.gray('–')} Build the project
  
      ${chalk.cyan(`$ ${cli.name} build`)}
      ${chalk.cyan(`$ ${cli.name} build --cwd ./path-to-project`)}
`);
};

const OUTPUT_DIR = '.vercel/output';

export default async function main(client: Client) {
  const { output } = client;

  // Ensure that `vc build` is not being invoked recursively
  if (process.env.__VERCEL_BUILD_RUNNING) {
    client.output.error(
      `${cmd(
        `${cli.name} build`
      )} must not recursively invoke itself. Check the Build Command in the Project Settings or the ${cmd(
        'build'
      )} script in ${cmd('package.json')}`
    );
    client.output.error(
      `Learn More: https://vercel.link/recursive-invocation-of-commands`
    );
    return 1;
  } else {
    process.env.__VERCEL_BUILD_RUNNING = '1';
  }

  // Parse CLI args
  const argv = getArgs(client.argv.slice(2), {
    '--cwd': String,
  });

  if (argv['--help']) {
    help();
    return 2;
  }

  // Set the working directory if necessary
  if (argv['--cwd']) {
    process.chdir(argv['--cwd']);
  }
  let cwd = process.cwd();

  // Read project settings, and pull them from Vercel if necessary
  let project = await readProjectSettings(join(cwd, VERCEL_DIR));
  while (!project?.settings) {
    const confirmed = await confirm(
      `No Project Settings found locally. Run ${cli.getCommandName(
        'pull'
      )} for retrieving them?`,
      true
    );
    if (!confirmed) {
      client.output.print(`Aborted. No Project Settings retrieved.\n`);
      return 0;
    }
    client.argv = [];
    const result = await pull(client);
    if (result !== 0) {
      return result;
    }
    project = await readProjectSettings(join(cwd, VERCEL_DIR));
  }

  // TODO: load env vars
  process.env.VERCEL = '1';

  // Load `package.json` and `vercel.json` files
  const [pkg, vercelConfig] = await Promise.all([
    readJSONFile<PackageJson>('package.json'),
    readJSONFile<VercelConfig>('vercel.json'),
  ]);
  if (pkg instanceof CantParseJSONFile) throw pkg;
  if (vercelConfig instanceof CantParseJSONFile) throw vercelConfig;

  // Get a list of source files
  const files = (await getFiles(cwd, client)).map(f => relative(cwd, f));
  console.log({ pkg, vercelConfig, files });

  // Detect the Vercel Builders that will need to be invoked
  const detectedBuilders = await detectBuilders(files, pkg, {
    ...vercelConfig,
    projectSettings: project.settings,
  });
  console.log(detectedBuilders);

  // TOOD: print warnings / errors

  const buildersSpec = new Map<string, npa.Result>();
  for (const builder of detectedBuilders.builders || []) {
    const parsed = npa(builder.use);
    if (typeof parsed.name !== 'string') continue;
    buildersSpec.set(parsed.name, parsed);
  }
  console.log(buildersSpec);

  // Add any Builders that are not yet present into `package.json`
  const deps = {
    ...pkg?.dependencies,
    ...pkg?.devDependencies,
  };
  const buildersToAdd = new Set<string>();
  for (const parsed of buildersSpec.values()) {
    if (typeof parsed.name !== 'string') continue;

    // `@vercel/static` is a special-case built-in Builder,
    // so it doesn't get added to `package.json`
    if (parsed.name === '@vercel/static') continue;

    // TODO: add semver parsing when version/tag is present
    if (!deps[parsed.name]) {
      buildersToAdd.add(parsed.raw);
    }
  }
  if (!deps['@vercel/build-utils']) {
    buildersToAdd.add('@vercel/build-utils');
  }
  console.log(buildersToAdd);
  if (buildersToAdd.size > 0) {
    // TODO: ensure `package.json` exists in `cwd`
    await spawnAsync('yarn', ['add', '--dev', ...buildersToAdd]);
  }

  // Import Builders
  const builders = new Map<string, any>();
  const builderPkgs = new Map<string, PackageJson>();
  for (const name of buildersSpec.keys()) {
    const path = require.resolve(name, {
      paths: [cwd, __dirname],
    });
    const pkgPath = require.resolve(`${name}/package.json`, {
      paths: [cwd, __dirname],
    });
    console.log({ name, path, pkgPath });
    const [builder, builderPkg] = await Promise.all([
      import(path),
      import(pkgPath),
    ]);
    builders.set(name, builder);
    builderPkgs.set(name, builderPkg);
  }
  console.log(builders);

  // Populate Files -> FileFsRef mapping
  const filesMap: Files = {};
  for (const path of files) {
    const { mode } = await fs.stat(path);
    filesMap[path] = new FileFsRef({ mode, fsPath: join(cwd, path) });
    //const extensionless = this.getExtensionlessFile(path);
    //if (extensionless) {
    //  this.files[extensionless] = new FileFsRef({ mode, fsPath });
    //}
  }

  // Delete output directory from potential previous build
  await fs.remove(OUTPUT_DIR);

  const buildStamp = stamp();

  // Create fresh new output directory
  await fs.mkdirp(OUTPUT_DIR);

  const ops: Promise<void>[] = [];

  // Write the `detectedBuilders` result to output dir
  ops.push(
    fs.writeJSON(join(OUTPUT_DIR, 'detected-builders.json'), detectedBuilders, {
      spaces: 2,
    })
  );

  // Execute Builders for detected entrypoints
  for (const build of detectedBuilders.builders || []) {
    if (typeof build.src !== 'string') continue;

    const { name } = npa(build.use);
    if (typeof name !== 'string') continue;

    const builder = builders.get(name);
    const builderPkg = builderPkgs.get(name);
    console.log({ build, name, builder });
    const buildConfig: Config = {
      ...build.config,
      projectSettings: project.settings,
      outputDirectory: project.settings.outputDirectory || undefined,
      buildCommand: project.settings.buildCommand || undefined,
      framework: project.settings.framework,
    };
    const buildOptions: BuildOptions = {
      files: filesMap,
      entrypoint: build.src,
      workPath: cwd,
      repoRootPath: cwd,
      config: buildConfig,
      meta: {
        skipDownload: true,
      },
    };
    const buildResult = await builder.build(buildOptions);

    // TODO remove
    delete buildResult.watch;

    console.log({ buildResult });

    ops.push(
      writeBuildResult(buildResult, build, builder, builderPkg!).catch(err => {
        console.log(err);
      })
    );
  }

  // Wait for filesystem operations to complete
  await Promise.all(ops);

  output.print(
    `${prependEmoji(
      `Build Completed in ${chalk.bold(OUTPUT_DIR)} ${chalk.gray(
        buildStamp()
      )}`,
      emoji('success')
    )}`
  );
}

async function writeBuildResult(
  buildResult: any,
  build: Builder,
  builder: any,
  builderPkg: PackageJson
) {
  await fs.mkdirp(dirname(join(OUTPUT_DIR, build.src!)));
  if (builder.version === 3) {
    return writeBuildResultV3(buildResult, build, builder, builderPkg);
  }
  return writeBuildResultV2(buildResult, build, builder, builderPkg);
}

// @ts-ignore
async function writeBuildResultV2(
  buildResult: any,
  build: Builder,
  builder: any,
  builderPkg: PackageJson
) {
  const outputDir = join(OUTPUT_DIR, build.src!);
  await fs.mkdirp(outputDir);
  const output = {};
  /*
    for (const [path, file] of Object.entries(buildResult.output)) {
        console.log({ path, file })
        await fs.mkdirp(join(outputDir, dirname(path)));
        if (file.type === 'Lambda') {

        } else if (file.type === 'FileFsRef') {

        }
    }
    */
  await Promise.all([
    //fs.writeFile(join(OUTPUT_DIR, `${build.src}.zip`), output.zipBuffer),
    fs.writeJSON(
      join(OUTPUT_DIR, `${build.src}.build-result.json`),
      {
        ...buildResult,
        builder: {
          name: builderPkg.name,
          version: builderPkg.version,
        },
        watch: undefined,
        output,
      },
      {
        spaces: 2,
      }
    ),
  ]);
}

async function writeBuildResultV3(
  buildResult: any,
  build: Builder,
  builder: any,
  builderPkg: PackageJson
) {
  const { output } = buildResult;
  if (output.type === 'Lambda') {
    await Promise.all([
      fs.writeFile(join(OUTPUT_DIR, `${build.src}.zip`), output.zipBuffer),
      fs.writeJSON(
        join(OUTPUT_DIR, `${build.src}.build-result.json`),
        {
          ...buildResult,
          builder: {
            name: builderPkg.name,
            version: builderPkg.version,
          },
          output: {
            ...output,
            zipBuffer: undefined,
          },
          watch: undefined,
        },
        {
          spaces: 2,
        }
      ),
    ]);
  } else {
    throw new Error(`Unsupported output type: "${output.type}`);
  }
}

/*
async function writeLambda(lambda: Lambda, path: string, builderPkg: PackageJson) {

}
*/
