export default (req, res) => {
  return res.status(200).json({ time: Date.now() });
};
