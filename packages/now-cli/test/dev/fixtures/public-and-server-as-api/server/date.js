export default (req, res) => {
  res.end(`current hour: ${Math.floor(Date.now() / 10000)}`);
};
