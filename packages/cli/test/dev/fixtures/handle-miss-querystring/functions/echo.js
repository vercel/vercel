const { parse } = require('url');

module.exports = (req, res) => {
  const { query } = parse(req.url, true);
  const { a, b } = query;
  res.end(`a=${a},b=${b}`);
};
