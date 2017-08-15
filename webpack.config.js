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
        exclude: [/node_modules/],
        use: {
          loader: 'babel-loader',
          options: {
            plugins: ['transform-flow-comments']
          }
        }
      },
      {
        test: /\.js$/,
        exclude: [/node_modules/],
        loader: 'shebang-loader'
      }
    ],
  },
  plugins: [
    new FlowBabelWebpackPlugin()
  ]
}
