import type { Env } from './types';

const hasProp = Object.prototype.hasOwnProperty;

// Keys that, if assigned via `obj[key] = value`, can mutate
// `Object.prototype` (or otherwise alter object internals) because they
// trigger the prototype accessor on the target. We skip them when copying
// untrusted env-shaped input.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Clones zero or more objects into a single new object while ensuring that the
 * `PATH` environment variable is defined when the `PATH` or `Path` environment
 * variables are defined.
 *
 * @param {Object} [...envs] Objects and/or `process.env` to clone and merge
 * @returns {Object} The new object
 */
export function cloneEnv(...envs: (Env | undefined)[]): Env {
  return envs.reduce((obj: Env, env) => {
    if (env === undefined || env === null) {
      return obj;
    }

    // Mixin the env first.  Use a manual copy instead of `Object.assign` so
    // that an attacker-controlled `__proto__` key (e.g. from
    // `JSON.parse('{"__proto__":{...}}')`) cannot pollute `Object.prototype`
    // by going through the prototype accessor on `obj`.
    for (const key of Object.keys(env)) {
      if (UNSAFE_KEYS.has(key)) continue;
      obj[key] = (env as Record<string, string | undefined>)[key];
    }

    if (hasProp.call(env, 'Path')) {
      // the system path is called `Path` on Windows and Node.js will
      // automatically return the system path when accessing `PATH`,
      // however we lose this proxied value when we destructure and
      // thus we must explicitly copy it, but we must also remove the
      // `Path` property since we can't have both a `PATH` and `Path`

      if (obj.Path !== undefined) {
        obj.PATH = obj.Path;
      }

      delete obj.Path;
    }

    return obj;
  }, {});
}
