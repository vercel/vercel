module.exports = (req, res) => {
  const months = [...Array(12).keys()].map(month => month + 1);
  res.json({ months });
};
