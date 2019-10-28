import minimatch from 'minimatch';
import { PackageJson, Builder, Config, BuilderFunctions } from './types';

interface ErrorResponse {
  code: string;
  message: string;
}

interface Options {
  tag?: 'canary' | 'latest' | string;
  functions?: BuilderFunctions;
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
function getBuilders({ tag }: Options = {}): Map<string, Builder> {
  const withTag = tag ? `@${tag}` : '';

  return new Map<string, Builder>([
    ['next', { src, use: `@now/next${withTag}`, config }],
  ]);
}

// Must be a function to ensure that the returned
// object won't be a reference
function getApiBuilders({ tag }: Options = {}): Builder[] {
  const withTag = tag ? `@${tag}` : '';

  return [
    { src: 'api/**/*.js', use: `@now/node${withTag}`, config },
    { src: 'api/**/*.ts', use: `@now/node${withTag}`, config },
    { src: 'api/**/*.go', use: `@now/go${withTag}`, config },
    { src: 'api/**/*.py', use: `@now/python${withTag}`, config },
    { src: 'api/**/*.rb', use: `@now/ruby${withTag}`, config },
  ];
}

function hasPublicDirectory(files: string[]) {
  return files.some(name => name.startsWith('public/'));
}

function hasBuildScript(pkg: PackageJson | undefined) {
  const { scripts = {} } = pkg || {};
  return Boolean(scripts && scripts['build']);
}

function getFunctionBuilder(
  file: string,
  prevBuilder: Builder | undefined,
  { functions = {} }: Options
) {
  const key = Object.keys(functions).find(
    k => minimatch(file, k) || file === k
  );
  const fn = key ? functions[key] : undefined;

  if (!fn || (!fn.runtime && !prevBuilder)) {
    return prevBuilder;
  }

  const src = (prevBuilder && prevBuilder.src) || file;
  const use = fn.runtime || (prevBuilder && prevBuilder.use);
  const config: Config = Object.assign({}, prevBuilder && prevBuilder.config);

  if (!use) {
    return prevBuilder;
  }

  if (fn.memory) {
    config.memory = fn.memory;
  }

  if (fn.maxDuration) {
    config.maxDuration = fn.maxDuration;
  }

  return { use, src, config };
}

async function detectFrontBuilder(
  pkg: PackageJson,
  options: Options
): Promise<Builder> {
  for (const [dependency, builder] of getBuilders(options)) {
    const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    const fnBuilder = getFunctionBuilder('package.json', builder, options);

    // Return the builder when a dependency matches
    if (deps[dependency]) {
      return fnBuilder || builder;
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

async function detectApiBuilders(
  files: string[],
  options: Options
): Promise<Builder[]> {
  const builds = files
    .sort(sortFiles)
    .filter(ignoreApiFilter)
    .map(file => {
      const apiBuilder = getApiBuilders(options).find(b =>
        minimatch(file, b.src)
      );
      const fnBuilder = getFunctionBuilder(file, apiBuilder, options);
      return fnBuilder ? { ...fnBuilder, src: file } : null;
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
  if (builders.some(b => b.use.startsWith('@now/next'))) {
    const hasApiPages = files.some(file => file.startsWith('pages/api/'));
    const hasApiBuilders = builders.some(b => b.src.startsWith('api/'));

    if (hasApiPages && hasApiBuilders) {
      return {
        code: 'conflicting_files',
        message:
          'It is not possible to use `api` and `pages/api` at the same time, please only use one option',
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
  options: Options = {}
): Promise<{
  builders: Builder[] | null;
  errors: ErrorResponse[] | null;
  warnings: ErrorResponse[];
}> {
  const errors: ErrorResponse[] = [];
  const warnings: ErrorResponse[] = [];

  // Detect all builders for the `api` directory before anything else
  const builders = await detectApiBuilders(files, options);

  if (pkg && hasBuildScript(pkg)) {
    builders.push(await detectFrontBuilder(pkg, options));

    const conflictError = await checkConflictingFiles(files, builders);

    if (conflictError) {
      warnings.push(conflictError);
    }
  } else {
    if (pkg && builders.length === 0) {
      // We only show this error when there are no api builders
      // since the dependencies of the pkg could be used for those
      errors.push(MISSING_BUILD_SCRIPT_ERROR);
      return { errors, warnings, builders: null };
    }

    // We allow a `public` directory
    // when there are no build steps
    if (hasPublicDirectory(files)) {
      builders.push({
        use: '@now/static',
        src: 'public/**/*',
        config,
      });
    } else if (
      builders.length > 0 &&
      files.some(f => !f.startsWith('api/') && f !== 'package.json')
    ) {
      // Everything besides the api directory
      // and package.json can be served as static files
      builders.push({
        use: '@now/static',
        src: '!{api/**,package.json}',
        config,
      });
    }
  }

  return {
    builders: builders.length ? builders : null,
    errors: errors.length ? errors : null,
    warnings,
  };
}
