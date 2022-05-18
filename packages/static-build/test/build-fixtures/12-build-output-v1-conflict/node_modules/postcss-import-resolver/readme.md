# postcss-import-resolver

[![JavaScript Style Guide](https://cdn.rawgit.com/standard/standard/master/badge.svg)](https://github.com/standard/standard)

## Installation

``` bash
$ npm install --save postcss-import-resolver

# or

$ yarn add postcss-import-resolver
```

## Usage (Webpack)

```js
const resolver = require('postcss-import-resolver')
const postcssLoader = {
  loader: 'postcss-loader',
  options: {
    plugins: {
      'postcss-import': {
        resolve: resolver({
          alias: {
            '~': 'src/'
          },
          modules: ['node_modules']
        })
      }
    }
  }
}
```
