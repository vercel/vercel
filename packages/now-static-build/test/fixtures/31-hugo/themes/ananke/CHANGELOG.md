# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [2.5.1] - 2019-08-10 (@budparr)

- Update asset dependencies to solve security issues


## [2.50] - 2019-08-10
 
 - Update i18n files to include contact form #185
 - Fix min_version #189
 - Remove deprecated meta tags for old Windows Mobile and BlackBerry #191


## [2.37] - 2018-12-26 (@budparr)

- Improve Readme with path to example site #146 
- Update asset dependencies a99f95ef1f4c1f9b0a278e534ce6ace1b7441fd8
- Improve social follow link accessibility #147 

## [2.35] - 2018-11-04 (@budparr)

- Add global background color class to footer (it's already on the header). Fixes #135

## [2.34] - 2018-11-03 (@budparr)

### Added

- Add a changelog.

### Changed

- Run Ananke with Hugo v0.50
- Remove default background image so users can choose to not use one at all. #133 (cdeguise)
- Add reading time and word count to pages, conditionally if set at global, page, or section level with the `show_reading_time` key. (thanks to @looer for starting)
