import fs from 'fs-extra';
import chalk from 'chalk';
import npa from 'npm-package-arg';
import { join, relative } from 'path';
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
  Meta,
} from '@vercel/build-utils';
import {
  appendRoutesToPhase,
  getTransformedRoutes,
  mergeRoutes,
  Route,
} from '@vercel/routing-utils';
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
import * as staticBuilder from '../util/build/static-builder';
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

export default async function main(client: Client): Promise<number> {
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
  //console.log(routesResult);

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

  let builds = vercelConfig?.builds || [];
  let zeroConfigRoutes: Route[] = [];

  if (builds.length > 0) {
    output.warn(
      'Due to `builds` existing in your configuration file, the Build and Development Settings defined in your Project Settings will not apply. Learn More: https://vercel.link/unused-build-settings'
    );
    /*
    return {
      buildSpecs: vercelConfig.builds.map(normalizeBuilderSpecPayload),
      routes: routesResult.routes || [],
    };
    */
  } else {
    // Zero config

    // Detect the Vercel Builders that will need to be invoked
    const detectedBuilders = await detectBuilders(files, pkg, {
      ...vercelConfig,
      projectSettings: project.settings,
      featHandleMiss: true,
    });
    //console.log(detectedBuilders);

    if (detectedBuilders.errors && detectedBuilders.errors.length > 0) {
      output.prettyError(detectedBuilders.errors[0]);
      return 1;
    }

    for (const w of detectedBuilders.warnings) {
      console.log(
        `Warning: ${w.message} ${w.action || 'Learn More'}: ${w.link}`
      );
    }

    if (detectedBuilders.builders) {
      builds = detectedBuilders.builders;
    }

    zeroConfigRoutes.push(...(detectedBuilders.redirectRoutes || []));
    zeroConfigRoutes.push(
      ...appendRoutesToPhase({
        routes: [],
        newRoutes: detectedBuilders.rewriteRoutes,
        phase: 'filesystem',
      })
    );
    zeroConfigRoutes = appendRoutesToPhase({
      routes: zeroConfigRoutes,
      newRoutes: detectedBuilders.errorRoutes,
      phase: 'error',
    });
    zeroConfigRoutes.push(...(detectedBuilders.defaultRoutes || []));
  }

  const buildersParsed = builds.map(b => npa(b.use));

  // Add any Builders that are not yet present into `package.json`
  const buildersToAdd = getBuildersToAdd(buildersParsed, pkg);
  //console.log(buildersToAdd);
  if (buildersToAdd.size > 0) {
    // TODO: ensure `package.json` exists in `cwd`
    // TODO: run `npm` / `pnpm` based on lockfile presence
    await spawnAsync('yarn', [
      'add',
      '--dev',
      '--ignore-workspace-root-check',
      ...buildersToAdd,
    ]);
    pkg = await readJSONFile<PackageJson>('package.json');
  }

  // Import Builders
  const builders = new Map<string, BuilderV2 | BuilderV3>();
  const builderPkgs = new Map<string, PackageJson>();
  for (const parsed of buildersParsed) {
    let { name } = parsed;
    if (!name) {
      continue;
    }

    if (builders.has(name)) {
      // Builder has already been loaded
      continue;
    }

    if (name === '@vercel/static') {
      // `@vercel/static` is a special-case built-in builder
      builders.set(name, staticBuilder);
      continue;
    }

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
    fs.writeJSON(
      join(OUTPUT_DIR, 'builds.json'),
      { builds },
      {
        spaces: 2,
      }
    )
  );

  // The `meta` config property is re-used for each Builder
  // invocation so that Builders can share state between
  // subsequent entrypoint builds.
  const meta: Meta = {
    skipDownload: true,
  };

  // Execute Builders for detected entrypoints
  let buildPatches: any[] = [];
  for (const build of builds) {
    if (typeof build.src !== 'string') continue;

    const { name } = npa(build.use);
    if (typeof name !== 'string') continue;

    const builder = builders.get(name);
    if (!builder) {
      throw new Error(`Failed to load Builder "${name}"`);
    }

    const builderPkg = builderPkgs.get(name);
    //console.log({ build, name, builder, builderPkg });
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
      meta,
    };
    const buildResult = await builder.build(buildOptions);

    if ('routes' in buildResult && Array.isArray(buildResult.routes)) {
      buildPatches.push({
        src: build.src,
        use: build.use,
        routes: buildResult.routes,
      });
    }

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
  let hadError = false;
  const errors = await Promise.all(ops);
  for (const error of errors) {
    if (error) {
      hadError = true;
      output.prettyError(error);
    }
  }
  if (hadError) return 1;

  //console.log({ zeroConfigRoutes });
  const finalRoutes = mergeRoutes({
    //userRoutes: routesResult.routes,
    userRoutes: undefined,
    builds: zeroConfigRoutes.length
      ? [
          {
            use: '@vercel/zero-config-routes',
            entrypoint: '/',
            routes: zeroConfigRoutes,
          },
          ...buildPatches,
        ]
      : buildPatches,
  });

  let config: any = {};
  try {
    config = await fs.readJSON(join(OUTPUT_DIR, 'config.json'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
  }
  config.routes = finalRoutes;
  await fs.writeJSON(join(OUTPUT_DIR, 'config.json'), config, { spaces: 2 });

  output.print(
    `${prependEmoji(
      `Build Completed in ${chalk.bold(OUTPUT_DIR)} ${chalk.gray(
        buildStamp()
      )}`,
      emoji('success')
    )}`
  );

  return 0;
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
