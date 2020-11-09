module.exports = async function (req, res) {
  return res.end(`Hello from /about.js on ${req.url}`);
};
