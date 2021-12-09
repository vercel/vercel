module.exports = (req, res) => {
  res.end(`RANDOMNESS_PLACEHOLDER:major:${process.versions.node}`);
};
