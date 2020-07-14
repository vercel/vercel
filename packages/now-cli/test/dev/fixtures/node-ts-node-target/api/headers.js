module.exports = (req, res) => {
  res.send({
    headers: req.headers,
  });
};
