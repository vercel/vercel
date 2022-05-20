const { getInfo } = require('./info');

module.exports = async function (req, res) {
  return res.end(
    `Hello from /product/index.js on ${req.url} - ${await getInfo()}`
  );
};
