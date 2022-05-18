const path = require('path');
const VirtualModulesPlugin = require('../..');
const swaggerJsDoc = require('swagger-jsdoc');

function SwaggerPlugin() {}

SwaggerPlugin.prototype.apply = function(compiler) {
  const pkgJsonModule = './package.json';
  const pkgJsonPath = require.resolve(pkgJsonModule);
  const pkgJson = require(pkgJsonModule);
  // Create some mock data for the virtual module
  const info = {
    title: pkgJson.name, version: pkgJson.version, description: pkgJson.description
  };
  // Creating an absolute path for 'swagger.json'
  // Webpack will look up 'swagger.json' by this path
  const swaggerJsonPath = path.join(path.dirname(pkgJsonPath), 'node_modules', 'swagger.json');
  // Creating a virtual module 'swagger.json' with initial content
  const virtualModules = new VirtualModulesPlugin({[swaggerJsonPath]: JSON.stringify({
    openapi: '3.0.0',
    info: info
  })});
  // Applying a webpack compiler to the virtual module
  virtualModules.apply(compiler);

  // Adding a webpack hook to create new virtual module with swaggerJsDoc() at compile time
  // Consult Swagger UI documentation for the settings passed to swaggerJsDoc()
  compiler.hooks.compilation.tap('SwaggerPlugin', function(compilation) {
    try {
      const swaggerJson = swaggerJsDoc({
        swaggerDefinition: {
          openapi: '3.0.0',
          info: info
        },
        apis: ['*.js', '!(node_modules)/**/*.js']
      });
      // Write new data to the virtual file at compile time
      virtualModules.writeModule(swaggerJsonPath, JSON.stringify(swaggerJson));
    } catch (e) {
      compilation.errors.push(e);
    }
  });
};

module.exports = {
  entry: './index.js',
  plugins: [new SwaggerPlugin()],
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  }
};
