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
  ignoreBuildScript?: boolean;
  projectSettings?: {
    framework?: string | null;
    devCommand?: string | null;
    buildCommand?: string | null;
    outputDirectory?: string | null;
  };
}

// Must be a function to ensure that the returned
// object won't be a reference
function getApiBuilders({ tag }: Pick<Options, 'tag'> = {}): Builder[] {
  const withTag = tag ? `@${tag}` : '';
  const config = { zeroConfig: true };

  return [
    { src: 'api/**/*.js', use: `@now/node${withTag}`, config },
    { src: 'api/**/*.ts', use: `@now/node${withTag}`, config },
    { src: 'api/**/!(*_test).go', use: `@now/go${withTag}`, config },
    { src: 'api/**/*.py', use: `@now/python${withTag}`, config },
    { src: 'api/**/*.rb', use: `@now/ruby${withTag}`, config },
  ];
}

function hasDirectory(name: string, files: string[]) {
  return files.some(file => file.startsWith(`${name}/`));
}

function hasBuildScript(pkg: PackageJson | undefined | null) {
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

  const { includeFiles, excludeFiles } = fn;

  if (includeFiles) Object.assign(config, { includeFiles });
  if (excludeFiles) Object.assign(config, { excludeFiles });

  return use ? { use, src, config } : prevBuilder;
}

function detectFrontBuilder(
  pkg: PackageJson | null | undefined,
  builders: Builder[],
  files: string[],
  options: Options
): Builder {
  const { tag, projectSettings = {} } = options;
  const withTag = tag ? `@${tag}` : '';
  let { framework } = projectSettings;

  const config: Config = {
    zeroConfig: true,
  };

  if (framework) {
    config.framework = framework;
  }

  if (projectSettings.devCommand) {
    config.devCommand = projectSettings.devCommand;
  }

  if (projectSettings.buildCommand) {
    config.buildCommand = projectSettings.buildCommand;
  }

  if (projectSettings.outputDirectory) {
    config.outputDirectory = projectSettings.outputDirectory;
  }

  if (pkg) {
    const deps: PackageJson['dependencies'] = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    if (deps['next']) {
      framework = 'nextjs';
    }
  }

  if (options.functions) {
    Object.entries(options.functions).forEach(([key, func]) => {
      // When the builder is not used yet we'll use it for the frontend
      if (
        builders.every(
          b => !(b.config && b.config.functions && b.config.functions[key])
        )
      ) {
        if (!config.functions) config.functions = {};
        config.functions[key] = { ...func };
      }
    });
  }

  if (framework === 'nextjs') {
    return { src: 'package.json', use: `@now/next${withTag}`, config };
  }

  // Entrypoints for other frameworks
  const entrypoints = new Set([
    'package.json',
    'config.yaml',
    'config.toml',
    'config.json',
    '_config.yml',
    'config.yml',
    'config.rb',
  ]);

  const source = pkg
    ? 'package.json'
    : files.find(file => entrypoints.has(file)) || 'package.json';

  return { src: source, use: `@now/static-build${withTag}`, config };
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

function detectApiBuilders(files: string[], options: Options): Builder[] {
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
function checkConflictingFiles(
  files: string[],
  builders: Builder[]
): ErrorResponse | null {
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
function checkUnusedFunctions(
  files: string[],
  apiBuilders: Builder[],
  frontendBuilder: Builder | null,
  options: Options
): ErrorResponse | null {
  const { functions = null } = options;
  const builderUse = frontendBuilder ? frontendBuilder.use : null;
  const builderFunctions =
    (frontendBuilder &&
      frontendBuilder.config &&
      frontendBuilder.config.functions) ||
    {};

  if (!functions) {
    return null;
  }

  const unmatchedFunctions = new Set(Object.keys(functions));

  apiBuilders.forEach(builder => {
    const builderFns = (builder.config && builder.config.functions) || {};

    Object.keys(builderFns).forEach(key => {
      unmatchedFunctions.delete(key);
    });
  });

  if (builderUse && builderUse.startsWith('@now/next')) {
    const functionKeys = Object.keys(builderFunctions);

    for (const file of files) {
      for (const key of functionKeys) {
        if (file === key || minimatch(file, key)) {
          if (!file.startsWith('src/pages/') && !file.startsWith('pages/')) {
            return {
              code: 'unused_function',
              message: `The function for ${key} can't be handled by any builder`,
            };
          } else {
            unmatchedFunctions.delete(key);
          }
        }
      }
    }
  }

  if (unmatchedFunctions.size) {
    const [unusedFunction] = Array.from(unmatchedFunctions);

    return {
      code: 'unused_function',
      message:
        `The function for ${unusedFunction} can't be handled by any builder. ` +
        `Make sure it is inside the api/ directory.`,
    };
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

    if (path.startsWith('/')) {
      return {
        code: 'invalid_function_source',
        message: `The function path "${path}" is invalid. The path must be relative to your project root and therefore cannot start with a slash.`,
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
            'Function Runtimes must have a valid version, for example `now-php@1.0.0`.',
        };
      }
    }

    if (func.includeFiles !== undefined) {
      if (typeof func.includeFiles !== 'string') {
        return {
          code: 'invalid_function_property',
          message: `The property \`includeFiles\` must be a string.`,
        };
      }
    }

    if (func.excludeFiles !== undefined) {
      if (typeof func.excludeFiles !== 'string') {
        return {
          code: 'invalid_function_property',
          message: `The property \`excludeFiles\` must be a string.`,
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
  const builders = detectApiBuilders(files, options);
  const { projectSettings = {} } = options;
  const { outputDirectory, buildCommand, framework } = projectSettings;

  let frontendBuilder: Builder | null = null;

  if (hasBuildScript(pkg) || buildCommand || framework) {
    frontendBuilder = detectFrontBuilder(pkg, builders, files, options);
  } else {
    if (!options.ignoreBuildScript && pkg && builders.length === 0) {
      // We only show this error when there are no api builders
      // since the dependencies of the pkg could be used for those
      errors.push({
        code: 'missing_build_script',
        message:
          'Your `package.json` file is missing a `build` property inside the `scripts` property.' +
          '\nMore details: https://zeit.co/docs/v2/platform/frequently-asked-questions#missing-build-script',
      });
      return { errors, warnings, builders: null };
    }

    // We allow a `public` directory
    // when there are no build steps
    const outDir = outputDirectory || 'public';

    if (hasDirectory(outDir, files)) {
      frontendBuilder = {
        use: '@now/static',
        src: `${outDir}/**/*`,
        config: {
          zeroConfig: true,
          outputDirectory: outDir,
        },
      };
    } else if (
      builders.length > 0 &&
      files.some(f => !f.startsWith('api/') && f !== 'package.json')
    ) {
      // Everything besides the api directory
      // and package.json can be served as static files
      frontendBuilder = {
        use: '@now/static',
        src: '!{api/**,package.json}',
        config: {
          zeroConfig: true,
        },
      };
    }
  }

  const unusedFunctionError = checkUnusedFunctions(
    files,
    builders,
    frontendBuilder,
    options
  );

  if (unusedFunctionError) {
    return {
      builders: null,
      errors: [unusedFunctionError],
      warnings,
    };
  }

  if (frontendBuilder) {
    builders.push(frontendBuilder);

    const conflictError = checkConflictingFiles(files, builders);

    if (conflictError) {
      warnings.push(conflictError);
    }
  }

  return {
    builders: builders.length ? builders : null,
    errors: errors.length ? errors : null,
    warnings,
  };
}
