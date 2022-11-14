module.exports = (req, res) => {
  const areHelpersAvailable = typeof req.query !== 'undefined';

  res.end(`${areHelpersAvailable ? 'yes' : 'no'}:RANDOMNESS_PLACEHOLDER`);
};
