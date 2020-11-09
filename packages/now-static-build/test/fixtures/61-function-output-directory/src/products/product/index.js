module.exports = async function (req, res) {
  return res.end(`Hello from /products/product/index.js on ${req.url}`);
};
