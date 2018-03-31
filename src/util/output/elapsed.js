const ms = require('ms')
const chalk = require('chalk')

// styles the "[30ms]" string based on a number of ms
module.exports = function elapsed (time) {
  return chalk.gray(`[${time < 1000 ? `${time}ms` : ms(time)}]`);
}
