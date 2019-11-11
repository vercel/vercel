module.exports = (req, res) => {
  res.end('default handler');
}

exports.myCustomHandler = async function(req, res) {
  res.end('custom handler');
}
