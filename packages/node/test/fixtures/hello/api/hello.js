export default (req, res) => {
  const { place = 'world' } = req.query;
  res.end(`Hello ${place}!`);
};
