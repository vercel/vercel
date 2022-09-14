import type { Env } from './types';

const { hasOwnProperty } = Object.prototype;

/**
 * Identical to `Object.assign()`, but ensures that the `PATH` environment
 * variable is defined even when the variable is spelled `Path`.
 *
 * @param {Object} [...envs] Objects and/or `process.env` to merge.
 * @returns {Object}
 */
export function cloneEnv(...envs: (Env | undefined)[]): Env {
  return envs.reduce((obj: Env, env) => {
    if (env === undefined || env === null) {
      return obj;
    }

    // the system path is called `Path` on Windows and Node.js will
    // automatically return the system path when accessing `PATH`,
    // however we lose this proxied value when we destructure and
    // thus we must explicitly copy it
    if (hasOwnProperty.call(env, 'PATH') || hasOwnProperty.call(env, 'Path')) {
      obj.PATH = env.PATH;
    }

    return Object.assign(obj, env);
  }, {});
}
