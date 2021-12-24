const isSvg = require('is-svg');

module.exports = (req, res) => {
  res.end(
    isSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#00CD9F"/></svg>'
    ).toString()
  );
};
