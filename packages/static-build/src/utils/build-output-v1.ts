import path from 'path';
import { promises as fs } from 'fs';
import { Route } from '@vercel/routing-utils';
import {
  Files,
  Lambda,
  NodeVersion,
  NodejsLambda,
  debug,
  glob,
} from '@vercel/build-utils';
import { BuildConfig, ImagesConfig, isObjectEmpty } from './_shared';

const VERCEL_BUILD_OUTPUT = '.vercel_build_output';

/**
 * Reads the .vercel_build_output directory and returns and object
 * that should be merged with the build outputs.
 */
export async function readBuildOutputDirectory({
  workPath,
  nodeVersion,
}: {
  workPath: string;
  nodeVersion: NodeVersion;
}) {
  const functions = await readFunctions({
    workPath,
    functionsMountPath: path.join('.vercel', 'functions'),
    nodeVersion,
  });

  const staticFiles = await readStaticFiles({ workPath });
  const routes =
    (await readBuildOutputConfig<Route[]>({
      workPath,
      configFileName: 'routes.json',
    })) || [];
  const images = await readBuildOutputConfig<ImagesConfig>({
    workPath,
    configFileName: 'images.json',
  });
  const build = await readBuildOutputConfig<BuildConfig>({
    workPath,
    configFileName: 'build.json',
  });

  const outputs = {
    staticFiles: isObjectEmpty(staticFiles) ? null : staticFiles,
    functions: isObjectEmpty(functions) ? null : functions,
    routes: routes.length ? routes : null,
    images,
    build,
  };

  if (outputs.functions) {
    console.log(`Detected Serverless Functions in "${VERCEL_BUILD_OUTPUT}"`);
  }

  if (outputs.staticFiles) {
    console.log(`Detected Static Assets in "${VERCEL_BUILD_OUTPUT}"`);
  }

  if (outputs.routes) {
    console.log(`Detected Routes Configuration in "${VERCEL_BUILD_OUTPUT}"`);
  }

  if (outputs.images) {
    console.log(`Detected Images Configuration in "${VERCEL_BUILD_OUTPUT}"`);
  }

  if (outputs.build) {
    console.log(`Detected Build Configuration in "${VERCEL_BUILD_OUTPUT}"`);
  }

  return outputs;
}

async function readStaticFiles({
  workPath,
}: {
  workPath: string;
}): Promise<Files> {
  const staticFilePath = path.join(workPath, VERCEL_BUILD_OUTPUT, 'static');
  const staticFiles = await glob('**', {
    cwd: staticFilePath,
  });

  return staticFiles;
}

async function readFunctions({
  workPath,
  functionsMountPath,
  nodeVersion,
}: {
  workPath: string;
  functionsMountPath: string;
  nodeVersion: NodeVersion;
}) {
  const output: Record<string, Lambda> = {};

  const functionsConfig = await readFunctionsConfig({ workPath });

  // Find all entrypoints and create a Lambda for each of them.
  let functionsPath = path.join(workPath, VERCEL_BUILD_OUTPUT, 'functions');
  let functionEntrypoints = await glob('*/index{,.*}', { cwd: functionsPath });
  let isLegacyFunctions = false;

  // To not break existing projects, we have to keep supporting the `functions/node` folder.
  if (!Object.keys(functionEntrypoints).length) {
    functionsPath = path.join(functionsPath, 'node');
    functionEntrypoints = await glob('*/index.{js,mjs}', {
      cwd: functionsPath,
    });
    isLegacyFunctions = true;
  }

  for (const entrypointFile of Object.keys(functionEntrypoints)) {
    let lambda: Lambda;
    const functionName = path.dirname(entrypointFile);
    const lambdaConfig = functionsConfig.get(functionName) || {};
    const { runtime, handler, ...config } = lambdaConfig;

    const lambdaFiles = await glob('**', {
      cwd: path.join(functionsPath, functionName),
    });

    if (!lambdaConfig.runtime && isLegacyFunctions) {
      // The bridge and launcher is only added for legacy functions.
      lambda = new NodejsLambda({
        files: lambdaFiles,
        handler: path.basename(entrypointFile),
        runtime: nodeVersion.runtime,
        ...config,
        shouldAddHelpers: false,
        shouldAddSourcemapSupport: false,
      });
    } else {
      if (!runtime) {
        throw new Error(
          `Missing the \`runtime\` property for the function \`${functionName}\`.`
        );
      }
      if (!handler) {
        throw new Error(
          `Missing the \`handler\` property for the function \`${functionName}\`.`
        );
      }
      lambda = new Lambda({
        files: lambdaFiles,
        ...config,
        handler,
        runtime,
      });
    }

    /**
     * For legacy functions we have to keep the `<name>/index` structure,
     * for new functions we'll just use `<name>`, as there is no need to
     * further nest it.
     */
    const parsed = path.parse(entrypointFile);
    const newPath = isLegacyFunctions
      ? path.join(functionsMountPath, parsed.dir, parsed.name)
      : path.join(functionsMountPath, functionName);

    output[newPath] = lambda;

    debug(
      `Created Lambda "${newPath}" from "${path.join(
        functionsPath,
        entrypointFile
      )}".`
    );
  }

  return output;
}

/**
 * Reads the global configuration file for functions and checks its types.
 */
async function readFunctionsConfig({ workPath }: { workPath: string }) {
  const data = await fs
    .readFile(
      path.join(workPath, VERCEL_BUILD_OUTPUT, 'config', 'functions.json'),
      'utf8'
    )
    .then(raw => {
      try {
        return JSON.parse(raw);
      } catch (_error) {
        return null;
      }
    })
    .catch(error => {
      if (error.code === 'ENOENT') {
        return null;
      }

      throw error;
    });

  const config = new Map<
    string,
    {
      memory?: number;
      maxDuration?: number;
      runtime?: string;
      handler?: string;
      regions?: string[];
    }
  >();

  if (!data) {
    return config;
  }

  Object.keys(data).forEach(key => {
    const fnConf = parseFunctionConfig(data[key]);
    if (fnConf) config.set(key, fnConf);
  });

  return config;
}

function parseFunctionConfig(data: Record<string, unknown>) {
  if (!data) {
    return null;
  }

  const config: {
    memory?: number;
    maxDuration?: number;
    runtime?: string;
    handler?: string;
    regions?: string[];
  } = {};

  if (typeof data.memory === 'number') {
    config.memory = data.memory;
  }

  if (typeof data.maxDuration === 'number') {
    config.maxDuration = data.maxDuration;
  }

  // In case of a custom runtime, a custom handler has to be provided.
  if (typeof data.runtime === 'string' && typeof data.handler === 'string') {
    config.runtime = data.runtime;
    config.handler = data.handler;
  }

  if (
    Array.isArray(data.regions) &&
    data.regions.every(r => typeof r === 'string')
  ) {
    config.regions = data.regions;
  }

  return config;
}

export async function readBuildOutputConfig<Config>({
  workPath,
  configFileName,
}: {
  workPath: string;
  configFileName: string;
}): Promise<Config | undefined> {
  const configPath = path.join(
    workPath,
    VERCEL_BUILD_OUTPUT,
    'config',
    configFileName
  );

  try {
    return JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}
