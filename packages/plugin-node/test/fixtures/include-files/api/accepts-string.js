const edge = require('edge.js');

export const config = {
  includeFiles: '../templates/accepts-string.edge',
};

module.exports = (req, resp) => {
  edge.registerViews(__dirname + '/../templates');

  resp.end(edge.render('accepts-string', { name: 'String!' }));
};
