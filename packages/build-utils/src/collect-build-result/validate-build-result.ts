import minimatch from 'minimatch';
import { NowBuildError } from '../errors';
import type {
  BuildResultV2Typical,
  BuildResultV3,
  BuilderFunctions,
  Config,
} from '../types';
import type { Lambda } from '../lambda';

export const SUPPORTED_AL2023_RUNTIMES = [
  'nodejs20.x',
  'nodejs22.x',
  'nodejs24.x',
  'provided.al2023',
  'python3.12',
  'python3.13',
  'python3.14',
  'ruby3.3',
  'bun1.x',
  'executable',
] as const;

const DEFAULT_ENTRYPOINT = '.';
const DEVELOPING_A_RUNTIME_URL =
  'https://github.com/vercel/vercel/blob/master/DEVELOPING_A_RUNTIME.md';

type BuildConfigWithVercelConfig = Config & {
  vercelConfig?: {
    functions?: BuilderFunctions;
  };
};

export interface ValidateBuildResultParams {
  allowInvalidRuntime?: boolean;
  buildConfig?: BuildConfigWithVercelConfig;
  buildResponse: BuildResultV2Typical | BuildResultV3;
  osRelease?: OsRelease | null;
  vercelBaseUrl?: string;
}

export interface ValidateBuildResultResult {
  buildOutputMap: BuildResultV2Typical['output'];
  customFunctionConfiguration?: BuilderFunctions[string];
}

function isSupportedAl2023Runtime(
  runtime: string
): runtime is (typeof SUPPORTED_AL2023_RUNTIMES)[number] {
  return SUPPORTED_AL2023_RUNTIMES.some(supported => supported === runtime);
}

type OsRelease = Record<string, string>;

export async function validateBuildResult({
  allowInvalidRuntime = false,
  buildConfig,
  buildResponse,
  osRelease,
  vercelBaseUrl,
}: ValidateBuildResultParams): Promise<ValidateBuildResultResult> {
  if (!('output' in buildResponse)) {
    throw new NowBuildError({
      code: 'NOW_SANDBOX_WORKER_BUILDER_ERROR',
      message:
        'The result of "builder.build" must include an `output` property for "@vercel/vc-build".',
    });
  }

  if (!buildResponse.output || typeof buildResponse.output !== 'object') {
    throw new NowBuildError({
      code: 'NOW_SANDBOX_WORKER_BUILDER_ERROR',
      message: 'The result of "builder.build" must be an object',
    });
  }

  const buildOutputMap = getAndVerifyOutputLambdasOrEdgeFuncs(buildResponse);

  if (osRelease?.VERSION === '2023') {
    const invalidRuntimes: { name: string; lambda: Lambda }[] = [];

    for (const [name, entry] of Object.entries(buildOutputMap)) {
      let lambda: Lambda | undefined;

      if (entry.type === 'Prerender') {
        lambda = entry.lambda;
      } else if (entry.type === 'Lambda') {
        lambda = entry;
      }

      if (!lambda) continue;

      if (!isSupportedAl2023Runtime(lambda.runtime)) {
        invalidRuntimes.push({ name, lambda });
      }
    }

    if (invalidRuntimes.length > 0 && !allowInvalidRuntime) {
      throw new NowBuildError({
        code: 'NOW_SANDBOX_WORKER_INVALID_RUNTIME',
        message: `The following Serverless Functions contain an invalid "runtime":\n${invalidRuntimes
          .map(({ name, lambda }) => `  - ${name} (${lambda.runtime})`)
          .join('\n')}`,
        link: getVercelUrl(
          '/docs/functions/runtimes#official-runtimes',
          vercelBaseUrl
        ),
      });
    }
  }

  const customFunctionConfiguration = getCustomFunctionConfigMaybe(buildConfig);

  if (customFunctionConfiguration?.runtime) {
    throw new NowBuildError({
      code: 'NOW_SANDBOX_WORKER_FUNCTION_RUNTIME_VERSION',
      message:
        `The Community Runtime ${customFunctionConfiguration.runtime} is not using version 3 of the Runtime API. ` +
        'If you are the Runtime author, see the docs by clicking "View Details" above.',
      link: DEVELOPING_A_RUNTIME_URL,
    });
  }

  return {
    buildOutputMap,
    customFunctionConfiguration,
  };
}

function getCustomFunctionConfigMaybe(
  buildConfig?: BuildConfigWithVercelConfig
): BuilderFunctions[string] | undefined {
  const functions =
    buildConfig?.functions ?? buildConfig?.vercelConfig?.functions;
  if (!functions) {
    return;
  }

  for (const [funcPath, config] of Object.entries(functions)) {
    if (
      funcPath === DEFAULT_ENTRYPOINT ||
      minimatch(DEFAULT_ENTRYPOINT, funcPath)
    ) {
      return config;
    }
  }

  return undefined;
}

function getVercelUrl(path: string, vercelBaseUrl = 'https://vercel.com') {
  const url = new URL(path, vercelBaseUrl);
  if (url.pathname === '/') {
    return url.href.slice(0, -1);
  }
  return url.href;
}

function getAndVerifyOutputLambdasOrEdgeFuncs(
  buildResponse: BuildResultV2Typical | BuildResultV3
) {
  return (buildResponse as BuildResultV2Typical).output;
}
