# now CLI

[![Build Status](https://travis-ci.org/zeit/now-cli.svg?branch=master)](https://travis-ci.org/zeit/now-cli)
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![Slack Channel](https://zeit-slackin.now.sh/badge.svg)](https://zeit.chat)

Realtime global deployments served over HTTP/2. You can find the FAQs [here](https://zeit.co/now#frequently-asked-questions).

## Usage

Firstly, make sure to install the package globally:

```bash
npm install -g now
```

Run this command in your terminal:

```bash
now
```

For more examples, usage instructions and other commands run:

```bash
now help
```

## Caught a Bug?

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device
2. Link the package to the global module directory: `npm link`
3. Transpile the source code and watch for changes: `npm run dev`
4. Generate a [testing token](https://zeit.co/account#api-tokens) and put it into `~/.now.json`
5. You can now start using `now` from the command line!

As always, you can use `npm test` to run the tests and see if your changes have broken anything.

## Authors

- Guillermo Rauch ([@rauchg](https://twitter.com/rauchg)) - [▲ZEIT](https://zeit.co)
- Leo Lamprecht ([@notquiteleo](https://twitter.com/notquiteleo)) - [▲ZEIT](https://zeit.co)
- Tony Kovanen ([@TonyKovanen](https://twitter.com/TonyKovanen)) - [▲ZEIT](https://zeit.co)
- Olli Vanhoja ([@OVanhoja](https://twitter.com/OVanhoja)) - [▲ZEIT](https://zeit.co)
- Naoyuki Kanezawa ([@nkzawa](https://twitter.com/nkzawa)) - [▲ZEIT](https://zeit.co)
