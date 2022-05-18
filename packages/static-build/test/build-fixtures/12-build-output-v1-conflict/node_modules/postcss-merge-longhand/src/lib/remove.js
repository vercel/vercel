'use strict';
/**
 * @param {import('postcss').Node} node
 * @return {import('postcss').Node}
 */
module.exports = function remove(node) {
  return node.remove();
};
