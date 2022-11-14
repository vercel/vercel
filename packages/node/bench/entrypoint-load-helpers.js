function doNothing() {}

module.exports = (req, res) => {
  doNothing(req.query.who);
  doNothing(req.body);
  doNothing(req.cookies);

  res.end('hello');
};
