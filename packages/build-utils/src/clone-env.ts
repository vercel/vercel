/**
 * Performs a shallow clone on the environment variable object.
 *
 * @param {Object} [currentEnv] The environment object to clone
 * @returns {Object}
 */
export function cloneEnv(currentEnv = process.env): typeof process.env {
  return {
    // the system path is called `Path` on Windows and Node.js will
    // automatically return the system path when accessing `PATH`,
    // however we lose this proxied value when we destructure and
    // thus we must explicitly copy it
    PATH: currentEnv.PATH,
    ...currentEnv,
  };
}
