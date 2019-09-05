import { PackageJson, Builder, Config } from './types';
import minimatch from 'minimatch';

interface ErrorResponse {
  code: string;
  message: string;
}

interface Options {
  tag?: 'canary' | 'latest' | string;
}

const src = 'package.json';
const config: Config = { zeroConfig: true };

const MISSING_BUILD_SCRIPT_ERROR: ErrorResponse = {
  code: 'missing_build_script',
  message:
    'Your `package.json` file is missing a `build` property inside the `script` property.' +
    '\nMore details: https://zeit.co/docs/v2/advanced/platform/frequently-asked-questions#missing-build-script',
};

// Static builders are special cased in `@now/static-build`
function getBuilders(): Map<string, Builder> {
  return new Map<string, Builder>([
    ['next', { src, use: '@now/next', config }],
  ]);
}

// Must be a function to ensure that the returned
// object won't be a reference
function getApiBuilders(): Builder[] {
  return [
    { src: 'api/**/*.js', use: '@now/node', config },
    { src: 'api/**/*.ts', use: '@now/node', config },
    { src: 'api/**/*.go', use: '@now/go', config },
    { src: 'api/**/*.py', use: '@now/python', config },
    { src: 'api/**/*.rb', use: '@now/ruby', config },
  ];
}

function hasPublicDirectory(files: string[]) {
  return files.some(name => name.startsWith('public/'));
}

function hasBuildScript(pkg: PackageJson | undefined) {
  const { scripts = {} } = pkg || {};
  return Boolean(scripts && scripts['build']);
}

async function detectBuilder(pkg: PackageJson): Promise<Builder> {
  for (const [dependency, builder] of getBuilders()) {
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

  if (file.endsWith('.d.ts')) {
    return false;
  }

  // If the file does not match any builder we also
  // don't want to create a route e.g. `package.json`
  if (getApiBuilders().every(({ src }) => !minimatch(file, src))) {
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
      const result = getApiBuilders().find(({ src }): boolean =>
        minimatch(file, src)
      );

      return result ? { ...result, src: file } : null;
    });

  const finishedBuilds = builds.filter(Boolean);
  return finishedBuilds as Builder[];
}

// When a package has files that conflict with `/api` routes
// e.g. Next.js pages/api we'll check it here and return an error.
async function checkConflictingFiles(
  files: string[],
  builders: Builder[]
): Promise<ErrorResponse | null> {
  // For Next.js
  if (builders.some(builder => builder.use.startsWith('@now/next'))) {
    const hasApiPages = files.some(file => file.startsWith('pages/api/'));
    const hasApiBuilders = builders.some(builder =>
      builder.src.startsWith('api/')
    );

    if (hasApiPages && hasApiBuilders) {
      return {
        code: 'conflicting_files',
        message:
          'It is not possible to use `api/` and `pages/api/` at the same time, please only use one option',
      };
    }
  }

  return null;
}

// When zero config is used we can call this function
// to determine what builders to use
export async function detectBuilders(
  files: string[],
  pkg?: PackageJson | undefined | null,
  options?: Options
): Promise<{
  builders: Builder[] | null;
  errors: ErrorResponse[] | null;
}> {
  const errors: ErrorResponse[] = [];

  // Detect all builders for the `api` directory before anything else
  let builders = await detectApiBuilders(files);

  if (pkg && hasBuildScript(pkg)) {
    builders.push(await detectBuilder(pkg));

    const conflictError = await checkConflictingFiles(files, builders);

    if (conflictError) {
      errors.push(conflictError);
      return { errors, builders: null };
    }
  } else {
    if (pkg && builders.length === 0) {
      // We only show this error when there are no api builders
      // since the dependencies of the pkg could be used for those
      errors.push(MISSING_BUILD_SCRIPT_ERROR);
      return { errors, builders: null };
    }

    // We allow a `public` directory
    // when there are no build steps
    if (hasPublicDirectory(files)) {
      builders.push({
        use: '@now/static',
        src: 'public/**/*',
        config,
      });
    } else if (builders.length > 0) {
      // We can't use pattern matching, since `!(api)` and `!(api)/**/*`
      // won't give the correct results
      builders.push(
        ...files
          .filter(name => !name.startsWith('api/'))
          .filter(name => !(name === 'package.json'))
          .map(name => ({
            use: '@now/static',
            src: name,
            config,
          }))
      );
    }
  }

  // Change the tag for the builders
  if (builders && builders.length) {
    const tag = options && options.tag;

    if (tag) {
      builders = builders.map((originBuilder: Builder) => {
        // Copy builder to make sure it is not a reference
        const builder = { ...originBuilder };

        // @now/static has no canary builder
        if (builder.use !== '@now/static') {
          builder.use = `${builder.use}@${tag}`;
        }

        return builder;
      });
    }
  }

  return {
    builders: builders.length ? builders : null,
    errors: errors.length ? errors : null,
  };
}
