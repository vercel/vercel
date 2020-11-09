module.exports = async function (req, res) {
  return res.end(`Hello from /products/product.js on ${req.url}`);
};
