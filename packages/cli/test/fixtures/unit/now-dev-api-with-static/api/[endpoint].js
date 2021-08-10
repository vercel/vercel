module.exports = (req, res) => {
  res.status(200).end(`bye:${req.query.endpoint}`);
};
