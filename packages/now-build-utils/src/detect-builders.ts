import minimatch from 'minimatch';
import { valid as validSemver } from 'semver';
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
    '\nMore details: https://zeit.co/docs/v2/platform/frequently-asked-questions#missing-build-script',
};

// Static builders are special cased in `@now/static-build`
function getBuilders({ tag }: Options = {}): Map<string, Builder> {
  const withTag = tag ? `@${tag}` : '';
  const config = { zeroConfig: true };

  return new Map<string, Builder>([
    ['next', { src, use: `@now/next${withTag}`, config }],
  ]);
}

// Must be a function to ensure that the returned
// object won't be a reference
function getApiBuilders({ tag }: Pick<Options, 'tag'> = {}): Builder[] {
  const withTag = tag ? `@${tag}` : '';
  const config = { zeroConfig: true };

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

function getApiFunctionBuilder(
  file: string,
  prevBuilder: Builder | undefined,
  { functions = {} }: Pick<Options, 'functions'>
) {
  const key = Object.keys(functions).find(
    k => file === k || minimatch(file, k)
  );
  const fn = key ? functions[key] : undefined;

  if (!fn || (!fn.runtime && !prevBuilder)) {
    return prevBuilder;
  }

  const src = (prevBuilder && prevBuilder.src) || file;
  const use = fn.runtime || (prevBuilder && prevBuilder.use);

  const config: Config = { zeroConfig: true };

  if (key) {
    Object.assign(config, {
      functions: {
        [key]: fn,
      },
    });
  }

  return use ? { use, src, config } : prevBuilder;
}

async function detectFrontBuilder(
  pkg: PackageJson,
  builders: Builder[],
  options: Options
): Promise<Builder> {
  for (const [dependency, builder] of getBuilders(options)) {
    const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);

    // Return the builder when a dependency matches
    if (deps[dependency]) {
      if (options.functions) {
        Object.entries(options.functions).forEach(([key, func]) => {
          // When the builder is not used yet we'll use it for the frontend
          if (
            builders.every(
              b => !(b.config && b.config.functions && b.config.functions[key])
            )
          ) {
            if (!builder.config) builder.config = {};
            if (!builder.config.functions) builder.config.functions = {};
            builder.config.functions[key] = { ...func };
          }
        });
      }

      return builder;
    }
  }

  // By default we'll choose the `static-build` builder
  return { src, use: '@now/static-build', config };
}

// Files that match a specific pattern will get ignored
export function getIgnoreApiFilter(optionsOrBuilders: Options | Builder[]) {
  const possiblePatterns: string[] = getApiBuilders().map(b => b.src);

  if (Array.isArray(optionsOrBuilders)) {
    optionsOrBuilders.forEach(({ src }) => possiblePatterns.push(src));
  } else if (optionsOrBuilders.functions) {
    Object.keys(optionsOrBuilders.functions).forEach(p =>
      possiblePatterns.push(p)
    );
  }

  return (file: string) => {
    if (!file.startsWith('api/')) {
      return false;
    }

    if (file.includes('/.')) {
      return false;
    }

    if (file.includes('/_')) {
      return false;
    }

    if (file.endsWith('.d.ts')) {
      return false;
    }

    if (possiblePatterns.every(p => !(file === p || minimatch(file, p)))) {
      return false;
    }

    return true;
  };
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
    .filter(getIgnoreApiFilter(options))
    .map(file => {
      const apiBuilders = getApiBuilders(options);
      const apiBuilder = apiBuilders.find(b => minimatch(file, b.src));
      const fnBuilder = getApiFunctionBuilder(file, apiBuilder, options);
      return fnBuilder ? { ...fnBuilder, src: file } : null;
    });

  return builds.filter(Boolean) as Builder[];
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

// When e.g. Next.js receives a `functions` property it has to make sure,
// that it can handle those files, otherwise there are unused functions.
async function checkUnusedFunctionsOnFrontendBuilder(
  files: string[],
  builder: Builder
): Promise<ErrorResponse | null> {
  const { config: { functions = undefined } = {} } = builder;

  if (!functions) return null;

  if (builder.use.startsWith('@now/next')) {
    const matchingFiles = files.filter(file =>
      Object.keys(functions).some(key => file === key || minimatch(file, key))
    );

    for (const matchedFile of matchingFiles) {
      if (
        !matchedFile.startsWith('src/pages/') &&
        !matchedFile.startsWith('pages/')
      ) {
        return {
          code: 'unused_function',
          message: `The function for ${matchedFile} can't be handled by any builder`,
        };
      }
    }
  }

  return null;
}

function validateFunctions(files: string[], { functions = {} }: Options) {
  for (const [path, func] of Object.entries(functions)) {
    if (path.length > 256) {
      return {
        code: 'invalid_function_glob',
        message: 'Function globs must be less than 256 characters long.',
      };
    }

    if (!func || typeof func !== 'object') {
      return {
        code: 'invalid_function',
        message: 'Function must be an object.',
      };
    }

    if (Object.keys(func).length === 0) {
      return {
        code: 'invalid_function',
        message: 'Function must contain at least one property.',
      };
    }

    if (
      func.maxDuration !== undefined &&
      (func.maxDuration < 1 ||
        func.maxDuration > 900 ||
        !Number.isInteger(func.maxDuration))
    ) {
      return {
        code: 'invalid_function_duration',
        message: 'Functions must have a duration between 1 and 900.',
      };
    }

    if (
      func.memory !== undefined &&
      (func.memory < 128 || func.memory > 3008 || func.memory % 64 !== 0)
    ) {
      return {
        code: 'invalid_function_memory',
        message:
          'Functions must have a memory value between 128 and 3008 in steps of 64.',
      };
    }

    if (files.some(f => f === path || minimatch(f, path)) === false) {
      return {
        code: 'invalid_function_source',
        message: `No source file matched the function for ${path}.`,
      };
    }

    if (func.runtime !== undefined) {
      const tag = `${func.runtime}`.split('@').pop();

      if (!tag || !validSemver(tag)) {
        return {
          code: 'invalid_function_runtime',
          message:
            'Function runtimes must have a valid version, for example `@now/node@1.0.0`.',
        };
      }
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

  const functionError = validateFunctions(files, options);

  if (functionError) {
    return {
      builders: null,
      errors: [functionError],
      warnings,
    };
  }

  // Detect all builders for the `api` directory before anything else
  const builders = await detectApiBuilders(files, options);

  if (pkg && hasBuildScript(pkg)) {
    const frontendBuilder = await detectFrontBuilder(pkg, builders, options);
    builders.push(frontendBuilder);

    const conflictError = await checkConflictingFiles(files, builders);

    if (conflictError) {
      warnings.push(conflictError);
    }

    const unusedFunctionError = await checkUnusedFunctionsOnFrontendBuilder(
      files,
      frontendBuilder
    );

    if (unusedFunctionError) {
      return {
        builders: null,
        errors: [unusedFunctionError],
        warnings,
      };
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
