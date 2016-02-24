'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _fsPromise = require('fs-promise');

var _fsPromise2 = _interopRequireDefault(_fsPromise);

var _getFiles = require('./get-files');

var _getFiles2 = _interopRequireDefault(_getFiles);

var _hash = require('./hash');

var _hash2 = _interopRequireDefault(_hash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

exports.default = function () {
  var ref = (0, _asyncToGenerator3.default)(_regenerator2.default.mark(function _callee(path, _ref) {
    var debug = _ref.debug;
    var files, hashes;
    return _regenerator2.default.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            _context.prev = 0;
            _context.next = 3;
            return _fsPromise2.default.stat(path);

          case 3:
            _context.next = 8;
            break;

          case 5:
            _context.prev = 5;
            _context.t0 = _context['catch'](0);
            throw new Error('Could not read directory ' + path + '.');

          case 8:

            if (debug) console.time('> [debug] Getting files');
            _context.next = 11;
            return (0, _getFiles2.default)(path);

          case 11:
            files = _context.sent;

            if (debug) console.timeEnd('> [debug] Getting files');

            if (debug) console.time('> [debug] Computing hashes');
            _context.next = 16;
            return (0, _hash2.default)(files);

          case 16:
            hashes = _context.sent;

            if (debug) console.timeEnd('> [debug] Computing hashes');

            if (debug) {
              hashes.forEach(function (val, key) {
                console.log('> [debug] Found "' + key + '" [' + val + ']');
              });
            }

            return _context.abrupt('return', 'https://test.now.run');

          case 20:
          case 'end':
            return _context.stop();
        }
      }
    }, _callee, this, [[0, 5]]);
  }));
  return function now(_x, _x2) {
    return ref.apply(this, arguments);
  };
}();