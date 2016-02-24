'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _map = require('babel-runtime/core-js/map');

var _map2 = _interopRequireDefault(_map);

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _fsPromise = require('fs-promise');

var _fsPromise2 = _interopRequireDefault(_fsPromise);

var _crypto = require('crypto');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Computes hashes for the contents of each file given.
 *
 * @param {Array} of {String} full paths
 * @return {Map}
 */

exports.default = function () {
  var ref = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee2(files) {
    var _this2 = this;

    var entries;
    return _regenerator2.default.wrap(function _callee2$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            _context2.next = 2;
            return _promise2.default.all(files.map(function () {
              var ref = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee(file) {
                var data;
                return _regenerator2.default.wrap(function _callee$(_context) {
                  while (1) {
                    switch (_context.prev = _context.next) {
                      case 0:
                        _context.next = 2;
                        return _fsPromise2.default.readFile(file);

                      case 2:
                        data = _context.sent;
                        return _context.abrupt('return', [file, hash(data)]);

                      case 4:
                      case 'end':
                        return _context.stop();
                    }
                  }
                }, _callee, _this2);
              })),
                  _this = _this2;
              return function (_x2) {
                return ref.apply(_this, arguments);
              };
            }()));

          case 2:
            entries = _context2.sent;
            return _context2.abrupt('return', new _map2.default(entries));

          case 4:
          case 'end':
            return _context2.stop();
        }
      }
    }, _callee2, this);
  }));
  return function hashes(_x) {
    return ref.apply(this, arguments);
  };
}();

/**
 * Computes a hash for the given buf.
 *
 * @param {Buffer} file data
 * @return {String} hex digest
 */

function hash(buf) {
  return (0, _crypto.createHash)('sha1').update(buf).digest('hex');
}