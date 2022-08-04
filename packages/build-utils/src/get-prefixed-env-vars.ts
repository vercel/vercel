type Envs = { [key: string]: string | undefined };

/**
 * Get the framework-specific prefixed System Environment Variables.
 * See https://vercel.com/docs/concepts/projects/environment-variables#system-environment-variables
 * @param envPrefix - Prefix, typically from `@vercel/frameworks`
 * @param envs - Environment Variables, typically from `process.env`
 */
export function getPrefixedEnvVars({
  envPrefix,
  envs,
}: {
  envPrefix: string | undefined;
  envs: Envs;
}): Envs {
  const vercelSystemEnvPrefix = 'VERCEL_';
  const newEnvs: Envs = {};
  if (envPrefix && envs.VERCEL_URL) {
    Object.keys(envs)
      .filter(key => key.startsWith(vercelSystemEnvPrefix))
      .forEach(key => {
        const newKey = `${envPrefix}${key}`;
        if (!(newKey in envs)) {
          newEnvs[newKey] = envs[key];
        }
      });
    // Tell turbo to exclude all Vercel System Env Vars
    // See https://github.com/vercel/turborepo/pull/1622
    newEnvs.TURBO_CI_VENDOR_ENV_KEY = `${envPrefix}${vercelSystemEnvPrefix}`;
  }
  return newEnvs;
}
