import fs from 'fs-extra';
import chalk from 'chalk';
import npa from 'npm-package-arg';
import {
  join,
  //normalize,
  relative,
} from 'path';
import {
  detectBuilders,
  Files,
  FileFsRef,
  PackageJson,
  spawnAsync,
  BuildOptions,
  Config,
  BuilderV2,
  BuilderV3,
} from '@vercel/build-utils';
import { getTransformedRoutes } from '@vercel/routing-utils';
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
import { getBuildersToAdd } from '../util/build/builders-to-add';
import { OUTPUT_DIR, writeBuildResult } from '../util/build/write-build-result';

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

export default async function main(client: Client) {
  const { output } = client;

  // Ensure that `vc build` is not being invoked recursively
  if (process.env.__VERCEL_BUILD_RUNNING) {
    output.error(
      `${cmd(
        `${cli.name} build`
      )} must not recursively invoke itself. Check the Build Command in the Project Settings or the ${cmd(
        'build'
      )} script in ${cmd('package.json')}`
    );
    output.error(
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
  let [pkg, vercelConfig] = await Promise.all([
    readJSONFile<PackageJson>('package.json'),
    readJSONFile<VercelConfig>('vercel.json'),
  ]);
  if (pkg instanceof CantParseJSONFile) throw pkg;
  if (vercelConfig instanceof CantParseJSONFile) throw vercelConfig;

  // Get a list of source files
  const files = (await getFiles(cwd, client)).map(f => relative(cwd, f));
  //console.log({ pkg, vercelConfig, files });

  const routesResult = getTransformedRoutes({ nowConfig: vercelConfig || {} });
  if (routesResult.error) {
    //throw new NowBuildError(routesResult.error);
  }

  if (vercelConfig?.builds && vercelConfig.functions) {
    /*
    throw new NowBuildError({
      code: 'bad_request',
      message:
        'The `functions` property cannot be used in conjunction with the `builds` property. Please remove one of them.',
      link: 'https://vercel.link/functions-and-builds',
    });
    */
  }

  if (vercelConfig?.builds && vercelConfig.builds.length > 0) {
    /*
    console.log(
      'Warning: Due to `builds` existing in your configuration file, the Build and Development Settings defined in your Project Settings will not apply. Learn More: https://vercel.link/unused-build-settings',
    );
    return {
      buildSpecs: vercelConfig.builds.map(normalizeBuilderSpecPayload),
      routes: routesResult.routes || [],
    };
    */
  }

  /*
  if (deployment.projectSettings?.serverlessFunctionRegion) {
    if (vercelConfig && vercelConfig.regions && vercelConfig.regions.length > 0) {
      console.log(
        'Warning: Due to `regions` existing in your configuration file, the Serverless Function Region defined in your Project Settings will not apply. Learn More: https://vercel.link/unused-region-setting',
      );
    } else if (deployment.regions?.length > 0) {
      console.log(
        'Warning: Due to `regions` assigned to this deployment, the Serverless Function Region defined in your Project Settings will not apply. Learn More: https://vercel.link/unused-region-setting',
      );
    }
  }
  */

  // Detect the Vercel Builders that will need to be invoked
  const detectedBuilders = await detectBuilders(files, pkg, {
    ...vercelConfig,
    projectSettings: project.settings,
    featHandleMiss: true,
  });
  //console.log(detectedBuilders);

  // TODO: print warnings / errors

  const buildersParsed = (detectedBuilders.builders || []).map(b => npa(b.use));

  // Add any Builders that are not yet present into `package.json`
  const buildersToAdd = getBuildersToAdd(buildersParsed, pkg);
  //console.log(buildersToAdd);
  if (buildersToAdd.size > 0) {
    // TODO: ensure `package.json` exists in `cwd`
    // TODO: run `npm` / `pnpm` based on lockfile presence
    await spawnAsync('yarn', ['add', '--dev', ...buildersToAdd]);
    pkg = await readJSONFile<PackageJson>('package.json');
  }

  // Import Builders
  const builders = new Map<string, BuilderV2 | BuilderV3>();
  const builderPkgs = new Map<string, PackageJson>();
  for (const parsed of buildersParsed) {
    let { name } = parsed;
    if (!name) continue;
    const path = require.resolve(name, {
      paths: [cwd, __dirname],
    });
    const pkgPath = require.resolve(`${name}/package.json`, {
      paths: [cwd, __dirname],
    });
    //console.log({ name, path, pkgPath });
    const [builder, builderPkg] = await Promise.all([
      import(path),
      import(pkgPath),
    ]);
    builders.set(name, builder);
    builderPkgs.set(name, builderPkg);
  }
  //console.log(builders);

  // Populate Files -> FileFsRef mapping
  const filesMap: Files = {};
  for (const path of files) {
    const { mode } = await fs.stat(path);
    filesMap[path] = new FileFsRef({ mode, fsPath: join(cwd, path) });
  }

  // Delete output directory from potential previous build
  await fs.remove(OUTPUT_DIR);

  const buildStamp = stamp();

  // Create fresh new output directory
  await fs.mkdirp(OUTPUT_DIR);

  const ops: Promise<Error | void>[] = [];

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
    if (!builder) {
      throw new Error(`Failed to load Builder "${name}"`);
    }

    const builderPkg = builderPkgs.get(name);
    //console.log({ build, name, builder });
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
    delete (buildResult as any).watch;

    ops.push(
      writeBuildResult(buildResult, build, builder, builderPkg!).catch(
        err => err
      )
    );
  }

  // Wait for filesystem operations to complete
  // TODO render progress bar?
  const errors = await Promise.all(ops);
  console.log(errors);

  output.print(
    `${prependEmoji(
      `Build Completed in ${chalk.bold(OUTPUT_DIR)} ${chalk.gray(
        buildStamp()
      )}`,
      emoji('success')
    )}`
  );
}

/*
function normalizeBuilderSpecPayload(buildSpecPayload: any) {
  if (!buildSpecPayload.use) {
    throw new NowBuildError({
      code: `invalid_build_specification`,
      message: 'Field `use` is missing in build specification',
      link: 'https://vercel.com/docs/configuration#project/builds',
      action: 'View Documentation',
    });
  }

  let src = normalize(buildSpecPayload.src || '**');
  if (src === '.' || src === './') {
    throw new NowBuildError({
      code: `invalid_build_specification`,
      message: 'A build `src` path resolves to an empty string',
      link: 'https://vercel.com/docs/configuration#project/builds',
      action: 'View Documentation',
    });
  }

  if (src.startsWith('/')) {
    src = src.substring(1);
  }

  return {
    ...buildSpecPayload,
    src,
  };
}
*/
