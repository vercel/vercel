var Metalsmith = require('metalsmith');
var markdown = require('metalsmith-markdown');
var layouts = require('metalsmith-layouts');
var permalinks = require('metalsmith-permalinks');

Metalsmith(__dirname)
  .metadata({
    title: 'My Static Site & Blog',
    description: "It's about saying »Hello« to the World.",
    generator: 'Metalsmith',
    url: 'http://www.metalsmith.io/',
  })
  .source('./src')
  .destination('./public')
  .clean(false)
  .use(markdown())
  .use(permalinks())
  .use(
    layouts({
      engine: 'handlebars',
    })
  )
  .build(function(err, files) {
    if (err) {
      throw err;
    }
  });
