## Changelog

**5.3.1** - <small>_April 15, 2022_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/5.3.0...5.3.1)

Maintenance

- Test against node v16 @ctalkington (#545)

Dependency updates

- Bump mocha from 8.3.0 to 9.0.2 @dependabot (#526)
- Bump actions/setup-node from 2.1.5 to 2.2.0 @dependabot (#525)
- Bump jsdoc from 3.6.6 to 3.6.7 @dependabot (#516)
- Bump lodash from 4.17.19 to 4.17.21 @dependabot (#514)
- Bump chai from 4.3.3 to 4.3.4 @dependabot (#508)
- Bump actions/setup-node from 2.2.0 to 2.3.0 @dependabot (#528)
- Bump mocha from 9.0.2 to 9.1.0 @dependabot (#544)
- Bump async from 3.2.0 to 3.2.1 @dependabot (#538)
- Bump actions/checkout from 2.3.4 to 3.0.1 @dependabot (#586)
- Bump actions/setup-node from 2.3.0 to 3.1.1 @dependabot (#585)
- Bump jsdoc from 3.6.7 to 3.6.10 @dependabot (#566)
- Bump async from 3.2.1 to 3.2.3 @dependabot (#562)
- Bump mocha from 9.1.0 to 9.2.2 @dependabot (#580)
- Bump tar from 6.1.0 to 6.1.11 @dependabot (#546)
- Bump chai from 4.3.4 to 4.3.6 @dependabot (#568)


**5.3.0** - <small>_March 7, 2021_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/5.2.0...5.3.0)

Maintenance

- Bump chai from 4.3.0 to 4.3.3 (#505)
- Bump zip-stream from 4.0.4 to 4.1.0 (#504)
- Bump mocha from 8.2.1 to 8.3.0 (#499)
- Bump actions/setup-node from v2.1.4 to v2.1.5 (#500)
- Bump tar from 6.0.5 to 6.1.0 (#487)
- Bump chai from 4.2.0 to 4.3.0 (#496)
- Bump tar-stream from 2.1.4 to 2.2.0 (#485)
- Bump actions/setup-node from v2.1.3 to v2.1.4 (#483)
- Update progress example (#384)

**5.2.0** - <small>_January 6, 2021_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/5.1.0...5.2.0)

Features

- Finalize should always return a promise (#480)

Maintenance

- Fix finalize method jsdoc return type (#482)
- Bump actions/setup-node from v2.1.2 to v2.1.3 (#479)
- Update README.md (#478)

**5.1.0** - <small>_November 19, 2020_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/5.0.2...5.1.0)

Features

- Add mode parameter to symlink (#469)
- Add isRegisteredFormat method (#462)

Bug Fixes

- Fix glob() `options` parameter's link (#453)

Maintenance

- Bump archiver-jsdoc-theme from 1.1.1 to 1.1.3 (#472)
- Bump zip-stream from 4.0.2 to 4.0.4 (#473)
- Bump jsdoc from 3.6.5 to 3.6.6 (#452)
- Bump readdir-glob from 1.0.0 to 1.1.1 (#460)
- Bump mocha from 8.1.3 to 8.2.1 (#465)
- Bump actions/setup-node from v2.1.1 to v2.1.2 (#459)
- Bump actions/checkout from v2.3.2 to v2.3.4 (#466)

**5.0.2** - <small>_September 11, 2020_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/5.0.1...5.0.2)

Maintenance

* Force bump tar-stream from 2.1.2 to 2.1.4 (#450)

**5.0.1** - <small>_September 10, 2020_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/5.0.0...5.0.1)

Maintenance

- Bump tar-stream from 2.1.3 to 2.1.4 (#448)
- Update docs (#441)
- Bump mocha from 8.1.1 to 8.1.3 (#444)
- Bump tar from 6.0.2 to 6.0.5 (#439)
- Bump mocha from 8.1.0 to 8.1.1 (#437)
- Bump actions/checkout from v2.3.1 to v2.3.2 (#438)
- Bump mocha from 8.0.1 to 8.1.0 (#436)
- Bump actions/setup-node from v2.1.0 to v2.1.1 (#432)
- Bump jsdoc from 3.6.4 to 3.6.5 (#434)

**5.0.0** - <small>_July 22, 2020_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/4.0.2...5.0.0)

* breaking: absolute path glob patterns are no longer supported: use cwd option instead.
* Replaced glob with readdir-glob to be memory efficient (#433) @Yqnn
* Bump zip-stream from 4.0.0 to 4.0.2 (#431) @dependabot
* Bump zip-stream from 3.0.1 to 4.0.0 (#430) @dependabot
* Bump mocha from 6.2.3 to 8.0.1 (#424) @dependabot
* Bump tar from 4.4.13 to 6.0.2 (#426) @dependabot
* Bump tar-stream from 2.1.2 to 2.1.3 (#427) @dependabot
* Bump rimraf from 2.7.1 to 3.0.2 (#425) @dependabot
* Bump actions/setup-node from v1 to v2.1.0 (#428) @dependabot
* Bump actions/checkout from v1 to v2.3.1 (#429) @dependabot
* Bump lodash from 4.17.15 to 4.17.19 (#423) @dependabot

**4.0.2** - <small>_July 11, 2020_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/4.0.1...4.0.2)

- update to async@^3.2.0 (#420)

**4.0.1** - <small>_April 14, 2020_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/4.0.0...4.0.1)

- update to zip-stream@^3.0.1

**4.0.0** - <small>_April 14, 2020_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/3.1.1...4.0.0)

- breaking: slowly catch up with node LTS, remove support for versions under 8.
- update multiple deps.
- fix for a hang with _statQueue (#388)

**3.1.1** - <small>_August 2, 2019_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/3.1.0...3.1.1)

- update zip-stream to v2.1.2

**3.1.0** - <small>_August 2, 2019_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/3.0.3...3.1.0)

- update zip-stream to v2.1.0

**3.0.3** - <small>_July 19, 2019_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/3.0.2...3.0.3)

- test: now targeting node v12
- other: update zip-stream@2.0.0

**3.0.2** - <small>_July 19, 2019_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/3.0.1...3.0.2)

- other: update dependencies

**3.0.1** - <small>_July 19, 2019_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/3.0.0...3.0.1)

- other: update dependencies
- docs: now deployed using netlify

**3.0.0** - <small>_August 22, 2018_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/2.1.1...3.0.0)

- breaking: follow node LTS, remove support for versions under 6. (#339)
- bugfix: use stats in tar.js and core.js (#326)
- other: update to archiver-utils@2 and zip-stream@2
- other: remove lodash npm module usage (#335, #339)
- other: Avoid using deprecated Buffer constructor (#312)
- other: Remove unnecessary return and fix indentation (#297)
- test: now targeting node v10 (#320)

**2.1.1** — <small>_January 10, 2018_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/2.1.0...2.1.1)

- bugfix: fix relative symlink paths (#293)
- other: coding style fixes (#294)

**2.1.0** — <small>_October 12, 2017_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/2.0.3...2.1.0)

- refactor: `directory` now uses glob behind the scenes. should fix some directory recursion issues. (#267, #275)
- docs: more info in quick start. (#284)

**2.0.3** — <small>_August 25, 2017_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/2.0.2...2.0.3)

- bugfix: revert #261 due to potential issues with editing entryData in special cases.
- bugfix: add var to entryData in glob callback (#273)

**2.0.2** — <small>_August 25, 2017_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/2.0.1...2.0.2)

- docs: fix changelog date.

**2.0.1** — <small>_August 25, 2017_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/2.0.0...2.0.1)

- bugfix: add const to entryData in glob callback (#261)
- other: coding style fixes (#263)

**2.0.0** — <small>_July 5, 2017_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/1.3.0...2.0.0)

- feature: support for symlinks. (#228)
- feature: support for promises on `finalize`. (#248)
- feature: addition of `symlink` method for programmatically creating symlinks within an archive.
- change: emit `warning` instead of `error` when stat fails and the process can still continue.
- change: errors and warnings now contain extended data (where available) and have standardized error codes (#256)
- change: removal of deprecated `bulk` functionality. (#249)
- change: removal of internal  `_entries` property in favor of `progress` event. (#247)
- change: support for node v4.0+ only. node v0.10 and v0.12 support has been dropped. (#241)

**1.3.0** — <small>_December 13, 2016_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/1.2.0...1.3.0)

- improve `directory` and `glob` methods to use events rather than callbacks. (#203)
- fix bulk warning spam (#208)
- updated mocha (#205)

**1.2.0** — <small>_November 2, 2016_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/1.1.0...1.2.0)

- Add a `process.emitWarning` for `deprecated` (#202)

**1.1.0** — <small>_August 29, 2016_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/1.0.1...1.1.0)

- minor doc fixes.
- bump deps to ensure latest versions are used.

**1.0.1** — <small>_July 27, 2016_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/1.0.0...1.0.1)

- minor doc fixes.
- dependencies upgraded.

**1.0.0** — <small>_April 5, 2016_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/0.21.0...1.0.0)

- version unification across many archiver packages.
- dependencies upgraded and now using semver caret (^).

**0.21.0** — <small>_December 21, 2015_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/0.20.0...0.21.0)

- core: add support for `entry.prefix`. update some internals to use it.
- core(glob): when setting `options.cwd` get an absolute path to the file and use the relative path for `entry.name`. #173
- core(bulk): soft-deprecation of `bulk` feature. will remain for time being with no new features or support.
- docs: initial jsdoc for core. http://archiverjs.com/docs
- tests: restructure a bit.

**0.20.0** — <small>_November 30, 2015_</small> — [Diff](https://github.com/archiverjs/node-archiver/compare/0.19.0...0.20.0)

- simpler path normalization as path.join was a bit restrictive. #162
- move utils to separate module to DRY.

[Release Archive](https://github.com/archiverjs/node-archiver/releases)
