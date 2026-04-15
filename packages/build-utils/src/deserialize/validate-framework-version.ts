import { NowBuildError } from '../errors';

type FrameworkMeta = {
  version: string;
};

const MAX_FRAMEWORK_VERSION_LENGTH = 50;

export function validateFrameworkVersion(
  frameworkVersion: string | undefined
): FrameworkMeta | undefined {
  if (!frameworkVersion) {
    return undefined;
  }

  if (typeof frameworkVersion !== 'string') {
    throw new NowBuildError({
      message: `Invalid config.json: "framework.version" type "${typeof frameworkVersion}" should be "string"`,
      code: 'VC_BUILD_INVALID_CONFIG_JSON_FRAMEWORK_VERSION_TYPE',
    });
  }

  if (frameworkVersion.length > MAX_FRAMEWORK_VERSION_LENGTH) {
    const trimmedFrameworkVersion = frameworkVersion.slice(
      0,
      MAX_FRAMEWORK_VERSION_LENGTH
    );
    throw new NowBuildError({
      message: `Invalid config.json: "framework.version" length ${frameworkVersion.length} > ${MAX_FRAMEWORK_VERSION_LENGTH}. "${trimmedFrameworkVersion}..."`,
      code: 'VC_BUILD_INVALID_CONFIG_JSON_FRAMEWORK_VERSION_LENGTH',
    });
  }

  return {
    version: frameworkVersion,
  };
}
