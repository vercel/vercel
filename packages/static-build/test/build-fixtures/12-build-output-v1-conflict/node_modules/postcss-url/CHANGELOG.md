# 10.1.3 - 2021-03-19

Fixed: update mime version

# 10.1.2 - 2021-03-19

Fixed: tilde operator for dependencies to allow for newer patch version

# 10.1.1 - 2020-11-26

Fixed: updated mime and xxhashjs versions
Fixed: postcss peerDependency version `8.1.2 -> 8.0.0`

# 10.1.0 - 2020-11-04

Fixed: Replaced mkdirp with make-dir ([PR#152](https://github.com/postcss/postcss-url/pull/152))
Fixed: updated dev dependencies, resolved `npm audit` issues

# 10.0.0 - 2020-10-23

Added: support for PostCSS 8 ([PR#148](https://github.com/postcss/postcss-url/pull/148))
Fixed: path resolution when to/from paths match ([PR#136](https://github.com/postcss/postcss-url/pull/136))

# 9.0.0 - 2019-04-17

Fixed: Async API
Added: support for PostCSS 8

# 8.0.0 - 2018-08-09

Changed: updated postcss 6.0.1 > 7.0.2, postcss-import 10.0.0 > 12.0.0, and required nodejs version ([PR#126](https://github.com/postcss/postcss-url/pull/126))
Changed: updated mime package

# 7.3.2 - 2018-04-03

Fixed: ignore urls which starts with `~` ([PR#119](https://github.com/postcss/postcss-url/pull/119))

# 7.3.1 - 2018-02-25

Fixed: ignore urls which starts with `//` ([PR#117](https://github.com/postcss/postcss-url/pull/117))

# 7.3.0 - 2017-10-26

Added: hash option - `append` ([PR#114](https://github.com/postcss/postcss-url/pull/114))
 
# 7.2.1 - 2017-10-19

Fixed: dependency security ([#108](https://github.com/postcss/postcss-url/issues/108)) ([#109](https://github.com/postcss/postcss-url/issues/109))

# 7.2.0 - 2017-10-17

Added: `assetsPath` option for `rebase`

# 7.1.2 - 2017-08-11

Fixed: wrap url by quotes for inlined svg ([#78](https://github.com/postcss/postcss-url/issues/78))

# 7.1.1 - 2017-07-24

Fixed: force wrap url by quotes for `optimizeSvgEncode` ([#105](https://github.com/postcss/postcss-url/issues/105))

# 7.1.0 - 2017-07-19

Added: `optimizeSvgEncode` option for inlined svg ([#103](https://github.com/postcss/postcss-url/issues/103))
Added: `rebase` as fallback in copy ([#104](https://github.com/postcss/postcss-url/issues/104))

# 7.0.0 - 2017-06-05

Added: PostCss 6 support

# 6.3.0 - 2017-06-04

Added: `multi` property for `custom`
Added: option to include fragment identifiers on inline data URIs
Added: support ignoring SVG fragment inlining warning

# 6.1.0 - 2017-05-13

Changed: filter functions access to asset object
Added: support crypto hash function methods
Added: support for postcss's dependency messaging

# 6.0.4 - 2017-04-06

Fixed: prepare asset without file path in decl
  ([#94](https://github.com/postcss/postcss-url/issues/94))
  
# 6.0.3 - 2017-04-04

Fixed: hash url error
  ([#89](https://github.com/postcss/postcss-url/issues/89))
  
# 6.0.2 - 2017-04-04

Fixed: match options before analyzing
  ([pull-88](https://github.com/postcss/postcss-url/pull/88))

# 6.0.1 - 2017-04-03

- Fixed: bug with empty options
  ([#87](https://github.com/postcss/postcss-url/issues/87))

# 6.0.0 - 2017-04-02

- Changed: es5 -> es6
- Added: multiple options for postcss-url as array
- Added: multiple `basePath` as array
- Added: _copy_ accept `basePath` param
- Changed: hash function to xxhash
- Changed: arguments in custom url callback
- Changed: no processing callback in _inline_ without `maxSize`
- Changed: `filter` matches by asset path, relative to project (process.cwd)
- Changed: _copy_ can work without postcss `to` option, but required `assetPath`

# 5.1.2 - 2016-05-01

- Fixed: node 6 compatibility
  ([#68](https://github.com/postcss/postcss-url/issues/68))

# 5.1.1 - 2016-02-03

- Fixed: typo in an error message
([#62](https://github.com/postcss/postcss-url/pull/62))

# 5.1.0 - 2016-01-19

- Added: `filter` option
([#61](https://github.com/postcss/postcss-url/pull/61))

# 5.0.2 - 2015-10-12

- Fixed: now rebase url in old Internet Explorer filter
`progid:DXImageTransform.Microsoft.AlphaImageLoader()`
([#55](https://github.com/postcss/postcss-url/pull/55))

# 5.0.1 - 2015-10-04

- Fixed: windows compatibility
([#52](https://github.com/postcss/postcss-url/pull/52))

# 5.0.0 - 2015-09-07

- Removed: compatibility with postcss v4.x
([#45](https://github.com/postcss/postcss-url/pull/45))
- Added: compatibility with postcss v5.x
([#76](https://github.com/postcss/postcss-url/pull/45))

# 4.0.1 - 2015-08-06

- Fixed: copy/rename of hash and query string for filenames
([#40](https://github.com/postcss/postcss-url/pull/40))

# 4.0.0 - 2015-06-18

- Fixed: fallback callback is working again
([#33](https://github.com/postcss/postcss-url/pull/33))
- Changed: Messages are now passed via postcss messages api
(no more console.warn)
- Added: callbacks might have now postcss result object as last param.
Handy to send some messages.

# 3.3.0 - 2015-06-16

- Added: postcss ^4.1.x dependency
([#31](https://github.com/postcss/postcss-url/pull/31))
- Added: new options to url callback
([#32](https://github.com/postcss/postcss-url/pull/32))

# 3.2.0 - 2015-05-01

- Added: New `fallback` option to use if max size is exceeded or url contains a hash
([#30](https://github.com/postcss/postcss-url/pull/30))

# 3.1.0 - 2015-05-01

- Added: New copy value for `url` option
([#29](https://github.com/postcss/postcss-url/pull/29))

# 3.0.0 - 2015-03-02

- Changed: upgraded to postcss v4.1.x

# 2.1.1 - 2015-03-31

- Fixed: whitespace before and after url() value are now supported and preserved
([#27](https://github.com/postcss/postcss-url/pull/27))

# 2.1.0 - 2015-03-12

- Added: related postcss declaration object has been added as a 2nd parameter to the url callback for custom processing

# 2.0.2 - 2015-01-31

- Fixed: url that are just hashes are ignored completely
([#25](https://github.com/postcss/postcss-url/issues/25))

# 2.0.1 - 2015-01-31

- Fixed: url with hashes are ignored for inline mode only
([#23](https://github.com/postcss/postcss-url/pull/23))

# 2.0.0 - 2015-01-26

- Added: compatibility with postcss v4.x
- Removed: compatibility with postcss v3.x

# 1.3.1 - 2015-01-26

- Fixed: dependency issue related to "directory-encoder"
([#22](https://github.com/postcss/postcss-url/pull/22))

# 1.3.0 - 2015-01-26

- Changed: SVGs are now in plain text (not base64 encoded) ([3c04f7a](https://github.com/postcss/postcss-url/commit/3c04f7abb1c017dfef34d3ddb00a5b44d8af951f), [#18](https://github.com/postcss/postcss-url/issues/18))
- Fixed: URLs with hashes (e.g. SVG fragments) are now ignored ([c3a9abc](https://github.com/postcss/postcss-url/commit/c3a9abcbed33ede323e7dcd6708b8fdb6168462f), [#20](https://github.com/postcss/postcss-url/pull/20))

# 1.2.3 - 2015-01-10

- Use Node's native buffer.toString("base64"). The js-base64 library was producing incorrect base64 for certain files
([#17](https://github.com/postcss/postcss-url/pull/17))

# 1.2.2 - unpublished

# 1.2.1 - 2014-12-09

- Data URIs are ignored correctly
([#15](https://github.com/postcss/postcss-url/pull/15))

# 1.2.0 - 2014-12-04

- `url` now accept a function to allow custom transformation of the url string
- All absolute url protocols are now ignored (not just /https?/).

# 1.1.3 - 2014-12-04

- Fix absolute urls being mangled
([#13](https://github.com/postcss/postcss-url/issues/13))

# 1.1.2 - 2014-11-08

- Fix MaxSize issue
([#9](https://github.com/postcss/postcss-url/issues/9))

# 1.1.1 - 2014-10-30

- Fix bug which leads to not correct base64 code

# 1.1.0 - 2014-10-29

- Add `maxSize` (size in kbytes) and `basePath` (base path for images to inline) options for _inline_ mode.

# 1.0.2 - 2014-10-10

- Fix non-working base64 encoding

# 1.0.1 - 2014-10-09

- Fix paths for Windows
([#3](https://github.com/postcss/postcss-url/issue/3) via [#4](https://github.com/postcss/postcss-url/pull/4))

# 1.0.0 - 2014-08-24

First release
