# now CLI

[![Build Status](https://travis-ci.org/zeit/now-cli.svg?branch=master)](https://travis-ci.org/zeit/now-cli)
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![Slack Channel](http://zeit-slackin.now.sh/badge.svg)](https://zeit.chat)

This is the command line interface for [now](https://zeit.co/now): Realtime global deployments served over HTTP/2.

It's also a special kind of package. When you install it using `npm install -g now`, it will automatically select the latest version of the [pkg](https://github.com/zeit/pkg)-ed `now` binary from [here](https://github.com/zeit/now-cli/releases) and place it on your device.

## Usage

Simply follow [this guide](https://zeit.co/docs/getting-started/installing-now)! Then run this command to see a list of all commands:

```bash
now help
```

## Why Ship a `pkg`-ed Binary?

- Simpler installation for non-Node users like those deploying [static files](https://zeit.co/blog/unlimited-static) or [Dockerfiles](https://zeit.co/blog/now-dockerfile).
- Consistency across platforms and installation mechanisms (`npm`, `brew` and manual scripts)
- Parsing and evaluation optimizations lead to a faster bootup time
- Easier installation in automation environments (like CI systems)
- Increased safety by providing a unified signature mechanism for releases
- We're able to select our own Node version of choice and can take advantage of the latest features

## Caught a Bug?

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device
2. Link the package to the global module directory: `npm run link` (not `npm link`)
3. You can now start using `now` from the command line!

As always, you can use `npm test` to run the tests and see if your changes have broken anything.

## Authors

- Guillermo Rauch ([@rauchg](https://twitter.com/rauchg)) - [▲ZEIT](https://zeit.co)
- Leo Lamprecht ([@notquiteleo](https://twitter.com/notquiteleo)) - [▲ZEIT](https://zeit.co)
- Tony Kovanen ([@TonyKovanen](https://twitter.com/TonyKovanen)) - [▲ZEIT](https://zeit.co)
- Olli Vanhoja ([@OVanhoja](https://twitter.com/OVanhoja)) - [▲ZEIT](https://zeit.co)
- Naoyuki Kanezawa ([@nkzawa](https://twitter.com/nkzawa)) - [▲ZEIT](https://zeit.co)
