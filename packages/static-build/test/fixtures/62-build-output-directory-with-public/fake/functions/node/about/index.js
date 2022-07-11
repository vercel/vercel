const { getAbout } = require('./util');

module.exports = async function (req, res) {
  return res.end(`Hello from /about/index.js on ${req.url} - ${getAbout()}`);
};
