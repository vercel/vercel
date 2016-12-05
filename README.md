# now CLI

[![Build Status](https://travis-ci.org/zeit/now-cli.svg?branch=master)](https://travis-ci.org/zeit/now-cli)
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![Slack Channel](https://zeit-slackin.now.sh/badge.svg)](https://zeit.chat)

Realtime global deployments served over HTTP/2. You can find the FAQ [here](https://github.com/zeit/now-cli/wiki/FAQ).

## Usage

Firstly, make sure to install the package globally:

```bash
$ npm install -g now
```

Run this in any directory:

```bash
$ now
```

For more examples, usage instructions and other commands run:

```bash
$ now help
```

## Caught a Bug?

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device
2. Link the package to the global module directory: `npm link`
3. Transpile the source code and watch for changes: `npm start`
4. You can now start using `now` from the command line!

As always, you can use `npm test` to run the tests and see if your changes have broken anything.
