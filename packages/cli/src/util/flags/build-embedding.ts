import { isPackageInstalled } from '@vercel/build-utils';

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
  cwd?: string
): Promise<boolean> {
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

  const hasVercelFlags = await isPackageInstalled('@flags-sdk/vercel', cwd);
  const hasFlagsCore = await isPackageInstalled('@vercel/flags-core', cwd);

  if (hasVercelFlags || hasFlagsCore) {
    return true;
  }

  return false;
}
