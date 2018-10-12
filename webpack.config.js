// Packages
const nodeExternals = require('webpack-node-externals');

module.exports = {
  entry: './src/now.js',
  target: 'node',
  externals: [nodeExternals()],
  devtool: 'source-map',
  node: {
    __dirname: false
  },
  output: {
    filename: 'dist/now.js',
    // this makes sure that the pathnames in the stack traces
    // are correct, avoiding a webpack: prefix inside a segment
    devtoolModuleFilenameTemplate: '[absolute-resource-path]',
  },
  module: {
    loaders: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loaders: ['shebang-loader', 'babel-loader']
      }
    ]
  }
};
