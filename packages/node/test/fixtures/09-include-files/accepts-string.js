const edge = require('edge.js');

module.exports = (req, resp) => {
  edge.registerViews('templates');

  resp.end(edge.render('accepts-string', { name: 'String!' }));
};
