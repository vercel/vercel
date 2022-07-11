module.exports = async function (req, res) {
  return res.end(`Hello from /root/index.js on ${req.url}`);
};
