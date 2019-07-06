const { parse } = require('url');

module.exports = (req, res) => {
  const { query } = parse(req.url, true);
  console.error({ query });
  res.setHeader(query.name, query.value);
  res.end();
};
