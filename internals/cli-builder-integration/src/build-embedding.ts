import {
  isPackageInstalled,
  type PackageJson,
  type ProjectSettings,
} from '@vercel/build-utils';

function isFlagsEmbedOption(
  input: string | undefined
): input is 'force-on' | 'force-off' {
  return input === 'force-on' || input === 'force-off';
}

const SDK_KEY_REGEX = /^vf_(?:server|client)_/;
function envHasSdkKey() {
  for (const value of Object.values(process.env)) {
    if (typeof value === 'string' && SDK_KEY_REGEX.test(value)) {
      return true;
    }
  }
}

export async function shouldEmbedFlagsDefinitions(
  cwd?: string,
  packageJson?: PackageJson | null,
  vercelFlags?: ProjectSettings['vercelFlags']
): Promise<boolean> {
  // legacy opt out
  if (process.env.VERCEL_FLAGS_DISABLE_DEFINITION_EMBEDDING === '1') {
    return false;
  }

  if (isFlagsEmbedOption(process.env.VERCEL_FLAGS_EMBED_DEFINITIONS)) {
    return process.env.VERCEL_FLAGS_EMBED_DEFINITIONS === 'force-on';
  }

  if (vercelFlags?.enabledAt !== undefined || envHasSdkKey()) {
    return true;
  }

  const hasVercelFlags = await isPackageInstalled('@flags-sdk/vercel', cwd);
  const hasFlagsCore = await isPackageInstalled('@vercel/flags-core', cwd);

  if (hasVercelFlags || hasFlagsCore) {
    return true;
  }

  // Dependencies may not be installed yet on builds without a restored cache.
  const dependencies = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
    ...packageJson?.optionalDependencies,
  };
  return Boolean(
    dependencies['@flags-sdk/vercel'] || dependencies['@vercel/flags-core']
  );
}
