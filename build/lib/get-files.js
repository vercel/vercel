'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _fsPromise = require('fs-promise');

var _fsPromise2 = _interopRequireDefault(_fsPromise);

var _path = require('path');

var _arrFlatten = require('arr-flatten');

var _arrFlatten2 = _interopRequireDefault(_arrFlatten);

var _arrayUnique = require('array-unique');

var _arrayUnique2 = _interopRequireDefault(_arrayUnique);

var _minimatch = require('minimatch');

var _minimatch2 = _interopRequireDefault(_minimatch);

var _ignored = require('./ignored');

var _ignored2 = _interopRequireDefault(_ignored);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Returns a list of files in the given
 * directory that are subject to be
 * synchronized.
 *
 * @param {String} full path to directory
 * @return {Array} comprehensive list of paths to sync
 */

exports.default = function () {
  var ref = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee(path) {
    var pkgData, pkg, search, found, npmIgnore, gitIgnore, ignored;
    return _regenerator2.default.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            _context.next = 2;
            return (0, _fsPromise.readFile)((0, _path.resolve)(path, 'package.json'), 'utf8');

          case 2:
            pkgData = _context.sent;
            pkg = JSON.parse(pkgData);
            search = (pkg.files || ['.']).concat('package.json');

            if (pkg.main) search = search.concat(pkg.main);
            search = search.map(function (file) {
              return asAbsolute(file, path);
            });

            _context.next = 9;
            return explode(search);

          case 9:
            _context.t0 = _context.sent;
            found = (0, _arrayUnique2.default)(_context.t0);
            _context.next = 13;
            return maybeRead((0, _path.resolve)(path, '.npmignore'));

          case 13:
            npmIgnore = _context.sent;

            if (!npmIgnore) {
              _context.next = 18;
              break;
            }

            _context.t1 = '';
            _context.next = 21;
            break;

          case 18:
            _context.next = 20;
            return maybeRead((0, _path.resolve)(path, '.gitignore'));

          case 20:
            _context.t1 = _context.sent;

          case 21:
            gitIgnore = _context.t1;
            ignored = (0, _arrayUnique2.default)(_ignored2.default.concat(gitIgnore.split('\n').filter(invalidFilter)).concat(npmIgnore.split('\n').filter(invalidFilter))).map(function (file) {
              return (0, _path.resolve)(path, file);
            });
            return _context.abrupt('return', found.filter(ignoredFilter(ignored)));

          case 24:
          case 'end':
            return _context.stop();
        }
      }
    }, _callee, this);
  }));
  return function getFiles(_x) {
    return ref.apply(this, arguments);
  };
}();

/**
 * Returns a filter function that
 * excludes ignored files in the path.
 *
 * @param {String} path
 * @return {Function} filter fn
 */

var ignoredFilter = function ignoredFilter(ignored) {
  return function (file) {
    return !ignored.some(function (test) {
      return (0, _minimatch2.default)(file, test);
    });
  };
};

/**
 * Returns a filter function that
 * excludes invalid rules for .*ignore files
 *
 * @param {String} path
 * @return {Function} filter fn
 */

var invalidFilter = function invalidFilter(path) {
  return !(
  /* commments */
  '#' === path[0] ||

  /* empty lines or newlines */
  !path.trim().length);
};

/**
 * Transform relative paths into absolutes,
 * and maintains absolutes as such.
 *
 * @param {String} maybe relative path
 * @param {String} parent full path
 */

var asAbsolute = function asAbsolute(path, parent) {
  if ('/' === path[0]) return path;
  return (0, _path.resolve)(parent, path);
};

/**
 * Explodes directories into a full list of files.
 * Eg:
 *   in:  ['/a.js', '/b']
 *   out: ['/a.js', '/b/c.js', '/b/d.js']
 *
 * @param {Array} of {String}s representing paths
 * @return {Array} of {String}s of full paths
 */

var explode = function () {
  var ref = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee5(paths) {
    var _this2 = this;

    var many, list;
    return _regenerator2.default.wrap(function _callee5$(_context5) {
      while (1) {
        switch (_context5.prev = _context5.next) {
          case 0:
            many = function () {
              var ref = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee3(all) {
                return _regenerator2.default.wrap(function _callee3$(_context3) {
                  while (1) {
                    switch (_context3.prev = _context3.next) {
                      case 0:
                        _context3.next = 2;
                        return _promise2.default.all(all.map(function () {
                          var ref = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee2(file) {
                            return _regenerator2.default.wrap(function _callee2$(_context2) {
                              while (1) {
                                switch (_context2.prev = _context2.next) {
                                  case 0:
                                    _context2.next = 2;
                                    return list(file);

                                  case 2:
                                    return _context2.abrupt('return', _context2.sent);

                                  case 3:
                                  case 'end':
                                    return _context2.stop();
                                }
                              }
                            }, _callee2, _this2);
                          })),
                              _this = _this2;
                          return function (_x4) {
                            return ref.apply(_this, arguments);
                          };
                        }()));

                      case 2:
                        return _context3.abrupt('return', _context3.sent);

                      case 3:
                      case 'end':
                        return _context3.stop();
                    }
                  }
                }, _callee3, _this2);
              })),
                  _this = _this2;
              return function many(_x3) {
                return ref.apply(_this, arguments);
              };
            }();

            list = function () {
              var ref = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee4(file) {
                var path, stat, all;
                return _regenerator2.default.wrap(function _callee4$(_context4) {
                  while (1) {
                    switch (_context4.prev = _context4.next) {
                      case 0:
                        path = file;
                        stat = undefined;
                        _context4.prev = 2;
                        _context4.next = 5;
                        return _fsPromise2.default.stat(path);

                      case 5:
                        stat = _context4.sent;
                        _context4.next = 14;
                        break;

                      case 8:
                        _context4.prev = 8;
                        _context4.t0 = _context4['catch'](2);

                        // in case the file comes from `files` or `main`
                        // and it wasn't specified with `.js` by the user
                        path = file + '.js';
                        _context4.next = 13;
                        return _fsPromise2.default.stat(path);

                      case 13:
                        stat = _context4.sent;

                      case 14:
                        if (!stat.isDirectory()) {
                          _context4.next = 21;
                          break;
                        }

                        _context4.next = 17;
                        return _fsPromise2.default.readdir(file);

                      case 17:
                        all = _context4.sent;
                        return _context4.abrupt('return', many(all.map(function (subdir) {
                          return asAbsolute(subdir, file);
                        })));

                      case 21:
                        return _context4.abrupt('return', path);

                      case 22:
                      case 'end':
                        return _context4.stop();
                    }
                  }
                }, _callee4, _this2, [[2, 8]]);
              })),
                  _this = _this2;
              return function list(_x5) {
                return ref.apply(_this, arguments);
              };
            }();

            _context5.next = 4;
            return many(paths);

          case 4:
            _context5.t0 = _context5.sent;
            return _context5.abrupt('return', (0, _arrFlatten2.default)(_context5.t0));

          case 6:
          case 'end':
            return _context5.stop();
        }
      }
    }, _callee5, this);
  }));
  return function explode(_x2) {
    return ref.apply(this, arguments);
  };
}();

/**
 * Returns the contents of a file if it exists.
 *
 * @return {String} results or `''`
 */

var maybeRead = function () {
  var ref = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee6(path) {
    return _regenerator2.default.wrap(function _callee6$(_context6) {
      while (1) {
        switch (_context6.prev = _context6.next) {
          case 0:
            _context6.prev = 0;
            _context6.next = 3;
            return _fsPromise2.default.readFile(path, 'utf8');

          case 3:
            return _context6.abrupt('return', _context6.sent);

          case 6:
            _context6.prev = 6;
            _context6.t0 = _context6['catch'](0);
            return _context6.abrupt('return', '');

          case 9:
          case 'end':
            return _context6.stop();
        }
      }
    }, _callee6, this, [[0, 6]]);
  }));
  return function maybeRead(_x6) {
    return ref.apply(this, arguments);
  };
}();