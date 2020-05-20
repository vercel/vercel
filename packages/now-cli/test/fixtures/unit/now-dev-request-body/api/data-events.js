module.exports = (req, res) => {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', d => {
    body += d;
  });
  req.on('end', () => {
    res.end(body);
  });
};
