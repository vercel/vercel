const chalk = require('chalk');

// Used for including uids in the output
// example: `(dom_ji13dj2fih4fi2hf)`
module.exports = id => chalk.gray(`(${id})`);
