import type { Dictionary } from '@vercel/client';

// Converts `env` Arrays, Strings and Objects into env Objects.
export const parseEnv = (env?: string | string[] | Dictionary<string>) => {
  if (!env) {
    return {};
  }

  if (typeof env === 'string') {
    // a single `--env` arg comes in as a String
    env = [env];
  }

  if (Array.isArray(env)) {
    return env.reduce((o, e) => {
      let key;
      let value;
      const equalsSign = e.indexOf('=');

      if (equalsSign === -1) {
        key = e;
      } else {
        key = e.slice(0, equalsSign);
        value = e.slice(equalsSign + 1);
      }

      o[key] = value;
      return o;
    }, {} as Dictionary<string | undefined>);
  }

  // assume it's already an Object
  return env;
};
