/**
 * Filename for a preview-pack tarball.
 *
 * `@vercel/node` → `vercel-node.tgz`. The URL must contain neither `@`
 * (pnpm 8 rejects that in dependency URLs) nor `%40` (yarn 1 parses
 * `%40vercel@0.0.0` as a package name).
 *
 * @param {string} packageName
 * @returns {string}
 */
function previewTarballFilename(packageName) {
  return `${packageName.replace(/^@/, '').replace(/\//g, '-')}.tgz`;
}

module.exports = { previewTarballFilename };
