export default (req, res) => {
  const hasHelpers = typeof req.query !== 'undefined';
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      hasHelpers,
      query: req.query,
    })
  );
};
