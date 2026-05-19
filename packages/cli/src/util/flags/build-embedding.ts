import { getInstalledPackageVersion } from '@vercel/build-utils/dist';

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

export async function shouldEmbedFlagsDefinitions(): Promise<boolean> {
  // legacy opt out
  if (process.env.VERCEL_FLAGS_DISABLE_DEFINITION_EMBEDDING === '1') {
    return false;
  }

  if (isFlagsEmbedOption(process.env.VERCEL_FLAGS_EMBED_DEFINITIONS)) {
    return process.env.VERCEL_FLAGS_EMBED_DEFINITIONS === 'force-on';
  }

  if (envHasSdkKey()) {
    return true;
  }

  const vercelFlagsVersion =
    await getInstalledPackageVersion('@flags-sdk/vercel');
  const vercelFlagsCoreVersion =
    await getInstalledPackageVersion('@vercel/flags-core');

  if (vercelFlagsVersion || vercelFlagsCoreVersion) {
    return true;
  }

  return false;
}
