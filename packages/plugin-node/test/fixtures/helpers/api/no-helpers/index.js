export const config = {
  helpers: false,
};

export default (req, res) => {
  const areHelpersAvailable = typeof req.query !== 'undefined';
  res.end(areHelpersAvailable ? 'yes' : 'no');
};
