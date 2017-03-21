/**
 * List of `zeit.world` nameservers
 */

const nameservers = new Set([
  'california.zeit.world',
  'london.zeit.world',
  'newark.zeit.world',
  'sydney.zeit.world',
  'iowa.zeit.world',
  'dallas.zeit.world',
  'amsterdam.zeit.world',
  'paris.zeit.world',
  'frankfurt.zeit.world',
  'singapore.zeit.world'
]);

/**
 * Given an array of nameservers (ie: as returned
 * by `resolveNs` from Node, assert that they're
 * zeit.world's.
 */
function isZeitWorld(ns) {
  return ns.length > 1 &&
    ns.every(host => {
      return nameservers.has(host);
    });
}

module.exports = isZeitWorld;
