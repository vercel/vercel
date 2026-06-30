import { NowBuildError } from '../errors';

type FrameworkMeta = {
  slug: string;
  version: string;
};

const MAX_SLUG_LENGTH = 50;
const MAX_FRAMEWORK_VERSION_LENGTH = 50;

export function validateFrameworkVersion(
  framework: FrameworkMeta | undefined
): FrameworkMeta | undefined {
  if (!framework) {
    return undefined;
  }

  const { slug, version } = framework;

  if (typeof slug !== 'string') {
    // Ideally this would throw, but slug is a new field and there might be some users that don't
    // emit it yet.
    return undefined;
  }

  if (typeof version !== 'string') {
    throw new NowBuildError({
      message: `Invalid config.json: "version" type "${typeof version}" should be "string"`,
      code: 'VC_BUILD_INVALID_CONFIG_JSON_FRAMEWORK_VERSION_TYPE',
    });
  }

  if (slug.length > MAX_SLUG_LENGTH) {
    const trimmedFrameworkSlug = slug.slice(0, MAX_SLUG_LENGTH);
    throw new NowBuildError({
      message: `Invalid config.json: "framework.slug" length ${slug.length} > ${MAX_SLUG_LENGTH}. "${trimmedFrameworkSlug}..."`,
      code: 'VC_BUILD_INVALID_CONFIG_JSON_FRAMEWORK_SLUG_LENGTH',
    });
  }

  if (version.length > MAX_FRAMEWORK_VERSION_LENGTH) {
    const trimmedFrameworkVersion = version.slice(
      0,
      MAX_FRAMEWORK_VERSION_LENGTH
    );
    throw new NowBuildError({
      message: `Invalid config.json: "framework.version" length ${version.length} > ${MAX_FRAMEWORK_VERSION_LENGTH}. "${trimmedFrameworkVersion}..."`,
      code: 'VC_BUILD_INVALID_CONFIG_JSON_FRAMEWORK_VERSION_LENGTH',
    });
  }

  return framework;
}
