const edge = require('edge.js');

export const config = {
  includeFiles: ['../templates/**'],
};

module.exports = (req, resp) => {
  edge.registerViews(__dirname + '/../templates');

  resp.end(edge.render('index', { name: 'Vercel!' }));
};
