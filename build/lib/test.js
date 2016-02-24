'use strict';

var _getFiles = require('./get-files');

var _getFiles2 = _interopRequireDefault(_getFiles);

var _path = require('path');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

(0, _getFiles2.default)((0, _path.resolve)('../mng-test/files-in-package')).then(function (files) {
  console.log(files);

  (0, _getFiles2.default)((0, _path.resolve)('../mng-test/files-in-package-ignore')).then(function (files2) {
    console.log('ignored: ');
    console.log(files2);
  }).catch(function (err) {
    console.log(err.stack);
  });
}).catch(function (err) {
  console.log(err.stack);
});