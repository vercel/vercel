
0.9.15 / 2016-04-01
===================

  * print logs from build [@rauchg]
  * fix unwanted bails in retrying logic [@rase-]
  * ignore update checking if no tty [@rauchg]
  * add messages for rate limit exceeded error [@nkzawa]
  * check for updates upon `-h` and `-v` [@rauchg]

0.9.14 / 2016-03-17
===================

  * index: support `now-start` [@rauchg]

0.9.13 / 2016-03-12
===================

  * index: validate `name` in package.json [@rauchg]

0.9.12 / 2016-03-12
===================

  * login: use https for `api.now.sh` [@rauchg]

0.9.11 / 2016-03-12
===================

  * fix registration url [@rauchg]

0.9.10 / 2016-03-12
===================

  * delete post-install [@rauchg]

0.9.9 / 2016-03-12
==================

  * now: expose version [@rauchg]

0.9.8 / 2016-03-12
==================

  * cap maximum concurrent uploads due to HTTP/2 streams limit [@rauchg]
  * make login resolve token [@rase-]

0.9.7 / 2016-03-10
==================

  * Add `-F, --forceSync` flag [@rauchg]

0.9.6 / 2016-03-04
==================

  * send files as buffers [@rase-]
  * simplify cfg reading / merging [@rauchg]
  * ignored: ignore `.dockerignore` [@rauchg]
  * add auto updater with support for timeout, exit handler [@rauchg]
  * package: bump `gulp-eslint` to work with latest eslint [@rauchg]
  * fix eslint [@rauchg]

0.9.5 / 2016-03-04
==================

  * login: fix usage of `Object.assign` [@rauchg]
  * post-install: improve error handling [@rauchg]
  * post-install: make runnable as script [@rauchg]
  * package: use `build/scripts` for postinstall [@rauchg]
  * index: fallback to directory name [@rauchg]
  * index: send `package.json` metadata like `name` [@rauchg]

0.9.4 / 2016-03-03
==================

  * login: extend configuration instead of overwriting it [@rauchg]

0.9.3 / 2016-03-03
==================

  * more debug information [@rauchg]

0.9.2 / 2016-03-03
==================

  * update ignores list [@rauchg]

0.9.1 / 2016-03-03
==================

  * index: throw error if `start` is not defined. [@rauchg]
  * now: revert usage of `now` [@rauchg]
  * package: simplify `files` [@rauchg]

0.9.0 / 2016-03-03
==================

  * initial release
