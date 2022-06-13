module.exports = (req, res) => {
  res.status(200).end(`hello:${req.query.endpoint}`);
};
