const edge = require('edge.js');

module.exports = (req, resp) => {
  edge.registerViews(__dirname);

  resp.end(edge.render('root', { text: 'Root!' }));
};
