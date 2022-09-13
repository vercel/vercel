import type { ProcessEnv } from './types';

/**
 * Performs a shallow clone on the environment variable object.
 *
 * @param {Object} [currentEnv] The environment object to clone
 * @returns {Object}
 */
export function cloneEnv(...envs: (ProcessEnv | undefined)[]): ProcessEnv {
  if (!envs.length) {
    envs.push(process.env);
  }

  return envs.reduce((obj: ProcessEnv, env) => {
    if (env === undefined || env === null) {
      return obj;
    }

    // the system path is called `Path` on Windows and Node.js will
    // automatically return the system path when accessing `PATH`,
    // however we lose this proxied value when we destructure and
    // thus we must explicitly copy it
    if (obj.PATH === undefined) {
      obj.PATH = env.PATH;
    }

    return Object.assign(obj, env);
  }, {});
}
