// Native
const path = require('path')

module.exports = {
  target: 'node',
  node: {
      __dirname: false,
      __filename: false,
      process: false
  },
  entry: [
      './src/index.js'
  ],
  output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'download.js'
  },
  module: {
      rules: [{
        test: /.js$/,
        exclude: /node_modules/,
        use: [{
          loader: 'babel-loader',
          query: {
              plugins: [
                  '@babel/transform-async-to-generator',
                  '@babel/transform-runtime'
              ],
              presets: [
                  '@babel/preset-env'
              ]
          }
        }]
      } ]
  }
}
