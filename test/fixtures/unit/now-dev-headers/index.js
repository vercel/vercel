const { parse } = require('url');

module.exports = (req, res) => {
  const { query } = parse(req.url, true);
  res.setHeader(query.name, query.value);
  res.end();
};
