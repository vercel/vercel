module.exports = (req, res) => {
  res.send({
    env: process.env,
    headers: req.headers,
  });
};
