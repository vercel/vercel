const path = require('path');
const readFile = require('./libs/readfile.js');

const helpFile = path.join(__dirname, 'statics/HELP.md');

// comment
module.exports = (req, res) => {
  res.end(readFile(helpFile));
};
