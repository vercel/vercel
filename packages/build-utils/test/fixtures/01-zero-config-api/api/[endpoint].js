module.exports = (req, res) => {
  res.end(req.query.endpoint);
};
