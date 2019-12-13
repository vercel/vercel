import minimatch from 'minimatch';
import { valid as validSemver } from 'semver';
import {
  Builder,
  Config,
  BuilderFunctions,
  DetectorResult,
  DetectorOutput,
} from './types';

interface ErrorResponse {
  code: string;
  message: string;
}

interface Options {
  tag?: 'canary' | 'latest' | string;
  functions?: BuilderFunctions;
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

function hasDirectory(fileName: string, files: string[]) {
  return files.some(name => name.startsWith(`${fileName}/`));
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
  detectorResult: Partial<DetectorOutput>,
  builders: Builder[],
  options: Options
): Builder {
  const { tag } = options;
  const withTag = tag ? `@${tag}` : '';

  const {
    framework,
    buildCommand,
    outputDirectory,
    devCommand,
  } = detectorResult;

  const frameworkSlug = framework ? framework.slug : null;

  const config: Config = {
    zeroConfig: true,
  };

  if (framework) {
    config.framework = framework;
  }

  if (devCommand) {
    config.devCommand = devCommand;
  }

  if (buildCommand) {
    config.buildCommand = buildCommand;
  }

  if (outputDirectory) {
    config.outputDirectory = outputDirectory;
  }

  // All unused functions will be used for the frontend
  if (options.functions) {
    Object.entries(options.functions).forEach(([key, func]) => {
      if (
        builders.every(
          b => !(b.config && b.config.functions && b.config.functions[key])
        )
      ) {
        config.functions = config.functions || {};
        config.functions[key] = { ...func };
      }
    });
  }

  if (frameworkSlug === 'next') {
    return { src: 'package.json', use: `@now/next${withTag}`, config };
  }

  return { src: 'package.json', use: `@now/static-build${withTag}`, config };
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
function checkUnusedFunctionsOnFrontendBuilder(
  files: string[],
  builder: Builder
): ErrorResponse | null {
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
          message:
            `The function for "${matchedFile}" can't be handled by any runtime. ` +
            `Please provide one with the "runtime" option.`,
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
  detectorResult: Partial<DetectorResult> | null = null,
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

  if (detectorResult && detectorResult.buildCommand) {
    const frontendBuilder = detectFrontBuilder(
      detectorResult,
      builders,
      options
    );
    builders.push(frontendBuilder);

    const conflictError = checkConflictingFiles(files, builders);

    if (conflictError) {
      warnings.push(conflictError);
    }

    const unusedFunctionError = checkUnusedFunctionsOnFrontendBuilder(
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
  } else if (
    detectorResult &&
    detectorResult.outputDirectory &&
    hasDirectory(detectorResult.outputDirectory, files)
  ) {
    builders.push({
      use: '@now/static',
      src: [...detectorResult.outputDirectory.split('/'), '**', '*']
        .filter(Boolean)
        .join('/'),
      config: { zeroConfig: true },
    });
  } else if (hasDirectory('public', files)) {
    builders.push({
      use: '@now/static',
      src: 'public/**/*',
      config: { zeroConfig: true },
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
      config: { zeroConfig: true },
    });
  }

  return {
    builders: builders.length ? builders : null,
    errors: errors.length ? errors : null,
    warnings,
  };
}
