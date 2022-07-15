type Envs = { [key: string]: string | undefined };

/**
 * Get the framework-specific prefixed System Environment Variables.
 * See https://vercel.com/docs/concepts/projects/environment-variables#system-environment-variables
 * @param envPrefix - Prefix, typically from `@vercel/frameworks`
 * @param envs - Environment Variables, typically from `process.env`
 */
export function getPrefixedEnvVars(envPrefix: string, envs: Envs): Envs {
  const newEnvs: Envs = {};
  if (envs.VERCEL_URL) {
    if (envPrefix) {
      Object.keys(envs)
        .filter(key => key.startsWith('VERCEL_'))
        .forEach(key => {
          const newKey = `${envPrefix}${key}`;
          if (!(newKey in envs)) {
            newEnvs[newKey] = envs[key];
          }
        });
    }
  }
  return newEnvs;
}
