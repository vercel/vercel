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
                    '@babel/transform-async-to-generator',
                    '@babel/transform-runtime'
                ],
                presets: [
                    '@babel/preset-env'
                ]
            }
        } ]
    }
}
