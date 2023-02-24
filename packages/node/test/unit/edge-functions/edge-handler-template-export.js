/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-undef */

// using CommonJS format because Module format didn't like
// exporting things coming from eval

const readFileSync = require('fs').readFileSync;
const join = require('path').join;

// we can't export these directly from the template
// because it will break compilation of the function code
const template = readFileSync(
  join(__dirname, '/../../../src/edge-functions/edge-handler-template.js')
);

// run the template script in the current module context
const { Request } = require('node-fetch'); // used by template
eval(template.toString());

module.exports = {
  buildUrl,
  respond,
  toResponseError,
  parseRequestEvent,
  registerFetchListener,
};
