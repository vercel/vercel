module.exports = (req, res) => {
  if (req.body == null) {
    return res.status(400).send({ error: 'no JSON object in the request' });
  }

  return res.status(200).send(JSON.stringify(req.body, null, 4));
};
