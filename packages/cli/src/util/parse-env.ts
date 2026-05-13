import type { Dictionary } from '@vercel/client';
import type { EnvVars } from '@vercel/build-utils';

// Converts `env` Arrays, Strings and Objects into env Objects.
export const parseEnv = (
  env?: string | string[] | Dictionary<string> | EnvVars
) => {
  if (!env) {
    return {};
  }

  if (typeof env === 'string') {
    // a single `--env` arg comes in as a String
    env = [env];
  }

  if (Array.isArray(env)) {
    const startingDict: Dictionary<string | undefined> = {};
    return env.reduce((o, e) => {
      let key: string | undefined;
      let value: string | undefined;
      const equalsSign = e.indexOf('=');

      if (equalsSign === -1) {
        key = e;
      } else {
        key = e.slice(0, equalsSign);
        value = e.slice(equalsSign + 1);
      }

      o[key] = value;

      return o;
    }, startingDict);
  }

  // Filter out new way to specify required env for services
  const result: Dictionary<string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
};
