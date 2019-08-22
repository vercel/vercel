const edge = require('edge.js');

module.exports = (req, resp) => {
  edge.registerViews('templates');

  resp.end(edge.render('index', { name: 'Now!' }));
};
