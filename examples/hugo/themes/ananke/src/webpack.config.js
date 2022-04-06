var path = require('path');
var ExtractTextPlugin = require('extract-text-webpack-plugin');
var webpack = require('webpack');
var AssetsPlugin = require('assets-webpack-plugin');

module.exports = {
  entry: {
    app: './js/main.js',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['env'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ExtractTextPlugin.extract({
          fallback: 'style-loader',
          use: 'css-loader?importLoaders=1!postcss-loader',
        }),
      },
    ],
  },

  output: {
    path: path.join(__dirname, './../static/dist'),
    filename: 'js/[name].[chunkhash].js',
  },

  resolve: {
    modules: [path.resolve(__dirname, 'src'), 'node_modules'],
  },

  plugins: [
    new AssetsPlugin({
      filename: 'webpack_assets.json',
      path: path.join(__dirname, '../data'),
      prettyPrint: true,
    }),
    new ExtractTextPlugin({
      filename: getPath => {
        return getPath('css/[name].[contenthash].css');
      },
      allChunks: true,
    }),
  ],
  watchOptions: {
    watch: true,
  },
};
