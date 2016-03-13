
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
