module.exports = (req, res) => {
  res.json({
    url: req.url,
    method: req.method,
    headers: req.headers,
  })
}
