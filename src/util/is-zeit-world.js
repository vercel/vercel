/**
 * Given an array of nameservers (ie: as returned
 * by `resolveNs` from Node, assert that they're
 * zeit.world's.
 */
function isZeitWorld(ns) {
  if (!ns.length) {
    return false;
  }
  return ns.every(host => host.endsWith('.zeit.world'));
}

module.exports = isZeitWorld;
