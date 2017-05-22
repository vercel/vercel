const path = require('path')
const webpack = require('webpack')

module.exports = {
  target: 'node',
  node: {
    __dirname: false,
    __filename: false
  },
  entry: [
    './src/index.js'
  ],
  output: {
    path: path.join(__dirname, 'dist'),
    filename: 'download.js'
  },
  module: {
    loaders: [ {
      test: /.js$/,
      loader: 'babel-loader',
      exclude: /node_modules/,
      query: {
        plugins: [
          'transform-async-to-generator',
          'transform-runtime'
        ],
        presets: [
          'es2015'
        ]
      }
    } ]
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify('production')
      }
    })
  ]
}
