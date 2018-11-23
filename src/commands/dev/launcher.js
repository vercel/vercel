module.exports = function createLauncher(/* { localConfig, output } */) {
  return async function launcher(req, res) {
    res.end(`Welcome to ${req.url}`);
  };
};
