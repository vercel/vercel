# Source Map JS

[![NPM](https://nodei.co/npm/source-map-js.png?downloads=true&downloadRank=true)](https://www.npmjs.com/package/source-map-js)

Difference between original [source-map](https://github.com/mozilla/source-map):

> TL,DR: it's fork of original source-map@0.6, but with perfomance optimizations.

This journey starts from [source-map@0.7.0](https://github.com/mozilla/source-map/blob/master/CHANGELOG.md#070). Some part of it was rewritten to Rust and WASM and API became async.

It's still a major block for many libraries like PostCSS or Webpack for example because they need to migrate the whole API to the async way. This is the reason why 0.6.1 has 2x more downloads than 0.7.3 while it's faster several times.

![Downloads count](media/downloads.png)

More important that WASM version has some optimizations in JS code too. This is why [community asked to create branch for 0.6 version](https://github.com/mozilla/source-map/issues/324) and port these optimizations but, sadly, the answer was «no». A bit later I discovered [the issue](https://github.com/mozilla/source-map/issues/370) created by [Ben Rothman (@benthemonkey)](https://github.com/benthemonkey) with no response at all.

[Roman Dvornov (@lahmatiy)](https://github.com/lahmatiy) wrote a [serveral posts](https://t.me/gorshochekvarit/76) (russian, only, sorry) about source-map library in his own Telegram channel. He mentioned the article [«Maybe you don't need Rust and WASM to speed up your JS»](https://mrale.ph/blog/2018/02/03/maybe-you-dont-need-rust-to-speed-up-your-js.html) written by [Vyacheslav Egorov (@mraleph)](https://github.com/mraleph). This article contains optimizations and hacks that lead to almost the same performance compare to WASM implementation.

I decided to fork the original source-map and port these optimizations from the article and several others PR from the original source-map.

---------

This is a library to generate and consume the source map format
[described here][format].

[format]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit

## Docs
Read **[full docs](https://github.com/7rulnik/source-map#readme)** on GitHub.
