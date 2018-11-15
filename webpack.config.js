const nodeExternals = require('webpack-node-externals');
const production = process.argv.includes('-p');

module.exports = {
  entry: './src/now.js',
  target: 'node',
  externals: production ? (context, request, callback) => {
    const prevent = [
      'electron',
      './rx.lite'
    ];

    if (prevent.includes(request)) {
      return callback(null, 'commonjs ' + request.replace(prevent[1], 'rx-lite'));
    }

    callback();
  } : [nodeExternals()],
  devtool: 'source-map',
  node: {
    __dirname: false
  },
  output: {
    filename: 'now.js',
    // this makes sure that the pathnames in the stack traces
    // are correct, avoiding a webpack: prefix inside a segment
    devtoolModuleFilenameTemplate: '[absolute-resource-path]',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loaders: ['shebang-loader', 'babel-loader']
      }
    ]
  }
};
