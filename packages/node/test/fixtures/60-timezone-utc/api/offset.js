export default (_req, res) => {
  res.end(`RANDOMNESS_PLACEHOLDER:offset:${new Date().getTimezoneOffset()}`);
};
