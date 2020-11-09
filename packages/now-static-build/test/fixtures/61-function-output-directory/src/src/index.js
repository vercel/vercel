module.exports = async function (req, res) {
  return res.end(`Hello from /index.js on ${req.url}`);
};
