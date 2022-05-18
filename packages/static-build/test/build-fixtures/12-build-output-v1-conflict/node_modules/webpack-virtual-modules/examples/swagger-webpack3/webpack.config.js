const path = require('path');
const VirtualModulesPlugin = require('../..');
const swaggerJsDoc = require('swagger-jsdoc');

function SwaggerPlugin() {
}

SwaggerPlugin.prototype.apply = function(compiler) {
  const pkgJsonModule = './package.json';
  const pkgJsonPath = require.resolve(pkgJsonModule);
  const pkgJson = require(pkgJsonModule);
  // Path on file system for `swagger.json`, where webpack should "see" it
  const swaggerJsonPath = path.join(path.dirname(pkgJsonPath), 'node_modules', 'swagger.json');
  // Creating virtual module with initial contents
  const virtualModules = new VirtualModulesPlugin({[swaggerJsonPath]: JSON.stringify({
    openapi: '3.0.0',
    info: { title: pkgJson.name, version: pkgJson.version, description: pkgJson.description }
  })});
  virtualModules.apply(compiler);

  compiler.plugin('compilation', function(compilation) {
    try {
      const swaggerJson = swaggerJsDoc({
        swaggerDefinition: {
          openapi: '3.0.0',
          info: { title: pkgJson.name, version: pkgJson.version, description: pkgJson.description }
        },
        apis: ['*.js', '!(node_modules)/**/*.js']
      });
      virtualModules.writeModule(swaggerJsonPath, JSON.stringify(swaggerJson));
    } catch (e) {
      compilation.errors.push(e);
    }
  });
}

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