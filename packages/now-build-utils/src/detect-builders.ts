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

// We need to sort the file paths by alphabet to make
// sure the routes stay in the same order e.g. for deduping
export function sortFiles(fileA: string, fileB: string) {
  return fileA.localeCompare(fileB);
}

export async function detectBuilders(
  files: string[],
  pkg?: PackageJson | undefined | null,
  options: Options = {}
): Promise<{
  builders: Builder[] | null;
  errors: ErrorResponse[] | null;
  warnings: ErrorResponse[];
}> {
  const apiBuilders: Builder[] = [];
  const errors: ErrorResponse[] = [];
  const warnings: ErrorResponse[] = [];
  let frontendBuilder: Builder | null = null;

  const functionError = validateFunctions(options);

  if (functionError) {
    return {
      builders: null,
      errors: [functionError],
      warnings,
    };
  }

  const apiMatches = getApiMatches(options);
  const sortedFiles = files.sort(sortFiles);

  // Keep track of functions that are used
  const usedFunctions = new Set<string>();

  const addToUsedFunctions = (builder: Builder) => {
    const key = Object.keys(builder.config!.functions || {})[0];
    if (key) usedFunctions.add(key);
  };

  const { projectSettings = {} } = options;
  const { buildCommand, outputDirectory, framework } = projectSettings;

  // If either is missing we'll make the frontend static
  const makeFrontendStatic = buildCommand === '' || outputDirectory === '';

  // Only used when there is no frontend builder,
  // but prevents looping over the files again.
  const usedOutputDirectory = outputDirectory || 'public';
  let hasUsedOutputDirectory = false;
  let hasNoneApiFiles = false;
  let hasNextApiFiles = false;

  // API
  for (const fileName of sortedFiles) {
    const apiBuilder = maybeGetApiBuilder(fileName, apiMatches, options);

    if (apiBuilder) {
      addToUsedFunctions(apiBuilder);
      apiBuilders.push(apiBuilder);
      continue;
    }

    if (
      !hasUsedOutputDirectory &&
      fileName.startsWith(`${usedOutputDirectory}/`)
    ) {
      hasUsedOutputDirectory = true;
    }

    if (
      !hasNoneApiFiles &&
      !fileName.startsWith('api/') &&
      fileName !== 'package.json'
    ) {
      hasNoneApiFiles = true;
    }

    if (
      !hasNextApiFiles &&
      (fileName.startsWith('pages/api') || fileName.startsWith('src/pages/api'))
    ) {
      hasNextApiFiles = true;
    }
  }

  if (
    !makeFrontendStatic &&
    (hasBuildScript(pkg) || buildCommand || framework)
  ) {
    // Framework or Build
    frontendBuilder = detectFrontBuilder(pkg, files, usedFunctions, options);
  } else {
    if (
      pkg &&
      !makeFrontendStatic &&
      !apiBuilders.length &&
      !options.ignoreBuildScript
    ) {
      // We only show this error when there are no api builders
      // since the dependencies of the pkg could be used for those
      errors.push(getMissingBuildScriptError());
      return { errors, warnings, builders: null };
    }

    // If `outputDirectory` is an empty string,
    // we'll default to the root directory.
    if (hasUsedOutputDirectory && outputDirectory !== '') {
      frontendBuilder = {
        use: '@now/static',
        src: `${usedOutputDirectory}/**/*`,
        config: {
          zeroConfig: true,
          outputDirectory: usedOutputDirectory,
        },
      };
    } else if (apiBuilders.length && hasNoneApiFiles) {
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
    frontendBuilder,
    usedFunctions,
    options
  );

  if (unusedFunctionError) {
    return {
      builders: null,
      errors: [unusedFunctionError],
      warnings,
    };
  }

  const builders: Builder[] = [];

  if (apiBuilders.length) {
    builders.push(...apiBuilders);
  }

  if (frontendBuilder) {
    builders.push(frontendBuilder);

    if (hasNextApiFiles && apiBuilders.length) {
      warnings.push({
        code: 'conflicting_files',
        message:
          'It is not possible to use `api` and `pages/api` at the same time, please only use one option',
      });
    }
  }

  return {
    warnings,
    builders: builders.length ? builders : null,
    errors: errors.length ? errors : null,
  };
}

function maybeGetApiBuilder(
  fileName: string,
  apiMatches: Builder[],
  options: Options
) {
  if (!fileName.startsWith('api/')) {
    return null;
  }

  if (fileName.includes('/.')) {
    return null;
  }

  if (fileName.includes('/_')) {
    return null;
  }

  if (fileName.includes('/node_modules/')) {
    return null;
  }

  if (fileName.endsWith('.d.ts')) {
    return null;
  }

  const match = apiMatches.find(({ src }) => {
    return src === fileName || minimatch(fileName, src);
  });

  const { fnPattern, func } = getFunction(fileName, options);

  const use = (func && func.runtime) || (match && match.use);

  if (!use) {
    return null;
  }

  const config: Config = { zeroConfig: true };

  if (fnPattern && func) {
    config.functions = { [fnPattern]: func };

    if (func.includeFiles) {
      config.includeFiles = func.includeFiles;
    }

    if (func.excludeFiles) {
      config.excludeFiles = func.excludeFiles;
    }
  }

  const builder: Builder = {
    use,
    src: fileName,
    config,
  };

  return builder;
}

function getFunction(fileName: string, { functions = {} }: Options) {
  const keys = Object.keys(functions);

  if (!keys.length) {
    return { fnPattern: null, func: null };
  }

  const func = keys.find(key => key === fileName || minimatch(fileName, key));

  return func
    ? { fnPattern: func, func: functions[func] }
    : { fnPattern: null, func: null };
}

function getApiMatches({ tag }: Options = {}) {
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

function hasBuildScript(pkg: PackageJson | undefined | null) {
  const { scripts = {} } = pkg || {};
  return Boolean(scripts && scripts['build']);
}

function detectFrontBuilder(
  pkg: PackageJson | null | undefined,
  files: string[],
  usedFunctions: Set<string>,
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
    // When the builder is not used yet we'll use it for the frontend
    Object.entries(options.functions).forEach(([key, func]) => {
      if (!usedFunctions.has(key)) {
        if (!config.functions) config.functions = {};
        config.functions[key] = { ...func };
      }
    });
  }

  if (framework === 'nextjs') {
    return { src: 'package.json', use: `@now/next${withTag}`, config };
  }

  // Entrypoints for other frameworks
  // TODO - What if just a build script is provided, but no entrypoint.
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

function getMissingBuildScriptError() {
  return {
    code: 'missing_build_script',
    message:
      'Your `package.json` file is missing a `build` property inside the `scripts` property.' +
      '\nMore details: https://zeit.co/docs/v2/platform/frequently-asked-questions#missing-build-script',
  };
}

function validateFunctions({ functions = {} }: Options) {
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

function checkUnusedFunctions(
  frontendBuilder: Builder | null,
  usedFunctions: Set<string>,
  options: Options
): ErrorResponse | null {
  const unusedFunctions = new Set(
    Object.keys(options.functions || {}).filter(key => !usedFunctions.has(key))
  );

  if (!unusedFunctions.size) {
    return null;
  }

  // Next.js can use functions only for `src/pages` or `pages`
  if (frontendBuilder && frontendBuilder.use.startsWith('@now/next')) {
    for (const fnKey of unusedFunctions.values()) {
      if (fnKey.startsWith('pages/') || fnKey.startsWith('src/pages')) {
        unusedFunctions.delete(fnKey);
      } else {
        return {
          code: 'unused_function',
          message: `The function for ${fnKey} can't be handled by any builder`,
        };
      }
    }
  }

  if (unusedFunctions.size) {
    const [unusedFunction] = Array.from(unusedFunctions);

    return {
      code: 'unused_function',
      message:
        `The function for ${unusedFunction} can't be handled by any builder. ` +
        `Make sure it is inside the api/ directory.`,
    };
  }

  return null;
}

/**
 * TODO
 * Remove this function
 */
export function getIgnoreApiFilter(optionsOrBuilders: Options | Builder[]) {
  const possiblePatterns: string[] = getApiMatches().map(b => b.src);

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
