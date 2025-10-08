module.exports = (req, res) => {
  if (res.json) {
    return res.end('helpers are enabled');
  }

  res.end('helpers are disabled');
}
