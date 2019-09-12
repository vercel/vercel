// Add a polyfill for Node 8 to fix ncc.
// We can delete this once fargate defaults to Node 10.
const util = require('util');
if (!util.getSystemErrorName) {
  util.getSystemErrorName = function getSystemErrorName(err: number) {
    return `Unknown system error ${err}`;
  };
}
