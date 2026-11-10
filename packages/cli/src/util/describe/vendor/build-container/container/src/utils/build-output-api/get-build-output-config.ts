// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import type { BuildOutputConfig } from './build-output-config';
import { NowBuildError } from '@vercel/build-utils';
import { join } from 'path';
import { maybeReadJSON } from '../maybe-read-json';

export async function getBuildOutputConfig(
  outputDir: string
): Promise<BuildOutputConfig | undefined> {
  const configPath = getBuildOutputConfigPath(outputDir);
  const config = await maybeReadJSON<BuildOutputConfig>(configPath);
  if (!config) {
    return undefined;
  }

  if (config.version !== 3) {
    throw new Error(
      `Expected \`version: 3\` in "${configPath}" file (received \`${config.version}\`)`
    );
  }

  validateDeploymentId(config.deploymentId);
  validateExperimentalServicesV2(config.experimentalServicesV2);
  const framework = validateFrameworkVersion(config.framework);
  return { ...config, framework };
}

function getBuildOutputConfigPath(outputDir: string) {
  return join(outputDir, 'config.json');
}

const MAX_DEPLOYMENT_ID_LENGTH = 32;
const MAX_FRAMEWORK_SLUG_LENGTH = 50;
const MAX_FRAMEWORK_VERSION_LENGTH = 50;
const VALID_DEPLOYMENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function validateDeploymentId(deploymentId: string | undefined) {
  if (deploymentId && deploymentId.length > MAX_DEPLOYMENT_ID_LENGTH) {
    throw new NowBuildError({
      message: `The configured deploymentId "${deploymentId}" exceeds the maximum length of ${MAX_DEPLOYMENT_ID_LENGTH} characters. Please use a shorter deploymentId.`,
      code: 'VC_BUILD_INVALID_DEPLOYMENT_ID_LENGTH',
    });
  }

  if (deploymentId && !VALID_DEPLOYMENT_ID_PATTERN.test(deploymentId)) {
    throw new NowBuildError({
      message: `The configured deploymentId "${deploymentId}" contains invalid characters. Only alphanumeric characters (a-z, A-Z, 0-9), hyphens (-), and underscores (_) are allowed.`,
      code: 'VC_BUILD_INVALID_DEPLOYMENT_ID_CHARACTERS',
    });
  }
}

function validateFrameworkVersion(framework: BuildOutputConfig['framework']) {
  if (!framework) {
    return undefined;
  }

  const { slug, version } = framework;
  if (typeof slug !== 'string') {
    return undefined;
  }
  if (typeof version !== 'string') {
    throw new NowBuildError({
      message: `Invalid config.json: "version" type "${typeof version}" should be "string"`,
      code: 'VC_BUILD_INVALID_CONFIG_JSON_FRAMEWORK_VERSION_TYPE',
    });
  }
  if (slug.length > MAX_FRAMEWORK_SLUG_LENGTH) {
    const trimmedSlug = slug.slice(0, MAX_FRAMEWORK_SLUG_LENGTH);
    throw new NowBuildError({
      message: `Invalid config.json: "framework.slug" length ${slug.length} > ${MAX_FRAMEWORK_SLUG_LENGTH}. "${trimmedSlug}..."`,
      code: 'VC_BUILD_INVALID_CONFIG_JSON_FRAMEWORK_SLUG_LENGTH',
    });
  }
  if (version.length > MAX_FRAMEWORK_VERSION_LENGTH) {
    const trimmedVersion = version.slice(0, MAX_FRAMEWORK_VERSION_LENGTH);
    throw new NowBuildError({
      message: `Invalid config.json: "framework.version" length ${version.length} > ${MAX_FRAMEWORK_VERSION_LENGTH}. "${trimmedVersion}..."`,
      code: 'VC_BUILD_INVALID_CONFIG_JSON_FRAMEWORK_VERSION_LENGTH',
    });
  }
  return framework;
}

function validateExperimentalServicesV2(
  experimentalServicesV2: BuildOutputConfig['experimentalServicesV2']
) {
  if (
    experimentalServicesV2 !== undefined &&
    (!experimentalServicesV2 ||
      typeof experimentalServicesV2 !== 'object' ||
      Array.isArray(experimentalServicesV2))
  ) {
    throw new NowBuildError({
      code: 'INVALID_BUILD_OUTPUT_CONFIG',
      message:
        'Invalid config.json: "experimentalServicesV2" must be an object.',
    });
  }
}

export async function getBuildOutputConfigOrThrow(outputDir: string) {
  const config = await getBuildOutputConfig(outputDir);
  if (!config) {
    throw new Error(
      `Config file was not found at "${getBuildOutputConfigPath(outputDir)}"`
    );
  } else {
    return config;
  }
}
