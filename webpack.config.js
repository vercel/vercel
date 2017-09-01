// Packages
const nodeExternals = require('webpack-node-externals')
const FlowBabelWebpackPlugin = require('flow-babel-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')

module.exports = {
  entry: './src/now.js',
  target: 'node',
  externals: [nodeExternals()],
  node: {
    __dirname: false
  },
  output: {
    filename: 'dist/now.js'
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
    new FlowBabelWebpackPlugin(),
    new CopyWebpackPlugin([
      { from: 'src/serverless/handler.js', to: 'dist/handler.js' }
    ])
  ]
}
