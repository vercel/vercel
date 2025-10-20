import os from 'node:os';

/**
 * Get the user agent string for the current environment.
 *
 * @exapmle
 * ```
 * getUserAgent({ name: 'my-cli', version: '1.0.0' });
 * // 'hostname @ my-cli 1.0.0 node-v18.16.0 linux (x64)'
 * ```
 */
export function getUserAgent(pkg: { name: string; version: string }): string {
  return `${os.hostname()} @ ${pkg.name} ${pkg.version} node-${
    process.version
  } ${os.platform()} (${os.arch()})`;
}
