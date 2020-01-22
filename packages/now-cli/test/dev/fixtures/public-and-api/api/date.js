export default (_req, res) => {
  res.end('current date: ' + new Date().toISOString());
};
