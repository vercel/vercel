import { PackageJson, Builder, Config } from './types';
import minimatch from 'minimatch';

interface Warning {
  code: string;
  message: string;
}

const src: string = 'package.json';
const config: Config = { zeroConfig: true };

// Static builders are special cased in `@now/static-build`
const BUILDERS = new Map<string, Builder>([
  ['next', { src, use: '@now/next', config }],
  ['nuxt', { src, use: '@now/nuxt', config }],
]);

const API_BUILDERS: Builder[] = [
  { src: 'api/**/*.js', use: '@now/node@canary', config },
  { src: 'api/**/*.ts', use: '@now/node@canary', config },
  { src: 'api/**/*.rs', use: '@now/rust', config },
  { src: 'api/**/*.go', use: '@now/go', config },
  { src: 'api/**/*.php', use: '@now/php', config },
  { src: 'api/**/*.py', use: '@now/python', config },
  { src: 'api/**/*.rb', use: '@now/ruby', config },
  { src: 'api/**/*.sh', use: '@now/bash', config },
];

const MISSING_BUILD_SCRIPT_WARNING: Warning = {
  code: 'missing_build_script',
  message:
    'Your `package.json` file is missing a `build` property inside the `script` property',
};

function hasPublicDirectory(files: string[]) {
  return files.some(name => name.startsWith('public/'));
}

function hasBuildScript(pkg: PackageJson | undefined) {
  const { scripts = {} } = pkg || {};
  return Boolean(scripts && scripts['build']);
}

async function detectBuilder(pkg: PackageJson): Promise<Builder> {
  for (const [dependency, builder] of BUILDERS) {
    const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);

    // Return the builder when a dependency matches
    if (deps[dependency]) {
      return builder;
    }
  }

  // By default we'll choose the `static-build` builder
  return { src, use: '@now/static-build', config };
}

// Files that match a specific pattern will get ignored
export function ignoreApiFilter(file: string) {
  if (file.includes('/.')) {
    return false;
  }

  if (file.includes('/_')) {
    return false;
  }

  // If the file does not match any builder we also
  // don't want to create a route e.g. `package.json`
  if (API_BUILDERS.every(({ src }) => !minimatch(file, src))) {
    return false;
  }

  return true;
}

// We need to sort the file paths by alphabet to make
// sure the routes stay in the same order e.g. for deduping
export function sortFiles(fileA: string, fileB: string) {
  return fileA.localeCompare(fileB);
}

async function detectApiBuilders(files: string[]): Promise<Builder[]> {
  const builds = files
    .sort(sortFiles)
    .filter(ignoreApiFilter)
    .map(file => {
      const result = API_BUILDERS.find(
        ({ src }): boolean => minimatch(file, src)
      );

      return result ? { ...result, src: file } : null;
    });

  const finishedBuilds = builds.filter(Boolean);
  return finishedBuilds as Builder[];
}

// When zero config is used we can call this function
// to determine what builders to use
export async function detectBuilders(
  files: string[],
  pkg?: PackageJson | undefined | null
): Promise<{
  builders: Builder[] | null;
  warnings: Warning[] | null;
}> {
  const warnings: Warning[] = [];

  // Detect all builders for the `api` directory before anything else
  const builders = await detectApiBuilders(files);

  if (pkg && hasBuildScript(pkg)) {
    builders.push(await detectBuilder(pkg));
  } else if (builders.length > 0) {
    // We only want to match this if there
    // are already builds for `api`, since
    // we'd add builds even though we shouldn't otherwise

    if (pkg) {
      warnings.push(MISSING_BUILD_SCRIPT_WARNING);
    }

    if (hasPublicDirectory(files)) {
      builders.push({
        use: '@now/static',
        src: 'public/**/*',
        config,
      });
    } else {
      // We can't use pattern matching, since `!(api)` and `!(api)/**/*`
      // won't give the correct results
      builders.push(
        ...files
          .filter(name => !name.startsWith('api/'))
          .map(name => ({
            use: '@now/static',
            src: name,
            config,
          }))
      );
    }
  }

  return {
    builders: builders.length ? builders : null,
    warnings: warnings.length ? warnings : null,
  };
}
