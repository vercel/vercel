module.exports = (req, res) => {
  let data = '';

  req.setEncoding('utf8');

  req.on('data', d => {
    data += d;
  });

  req.on('end', () => {
    res.send({ data });
  });
};
