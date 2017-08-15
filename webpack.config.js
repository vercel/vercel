// Packages
const FlowBabelWebpackPlugin = require('flow-babel-webpack-plugin')
const nodeExternals = require('webpack-node-externals')

module.exports = {
  entry: './src/now.js',
  target: 'node',
  externals: [nodeExternals()],
  output: {
    filename: 'dist/now.js',
  },
  module: {
    loaders: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loaders: ['shebang-loader', 'babel-loader']
      }
    ]
  },
  plugins: [
    new FlowBabelWebpackPlugin()
  ]
}
