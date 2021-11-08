const edge = require('edge.js');

export const config = {
  includeFiles: '../root.edge',
};

module.exports = (req, resp) => {
  edge.registerViews(__dirname + '/..');

  resp.end(edge.render('root', { text: 'Root!' }));
};
