module.exports = (req, res) => {
  res.end(`{ "urls": "${req.url}" }`);
};
