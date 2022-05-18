'use strict';

const abortController = require('./chunks/abort-controller.cjs');
require('node:fs');
require('node:path');
require('node:http');
require('node:https');
require('node:zlib');
require('node:stream');
require('node:buffer');
require('node:util');
require('node:url');
require('node:net');

globalThis.fetch = globalThis.fetch || abortController.fetch;
globalThis.Blob = globalThis.Blob || abortController._Blob;
globalThis.File = globalThis.File || abortController.File;
globalThis.FormData = globalThis.FormData || abortController.FormData;
globalThis.Headers = globalThis.Headers || abortController.Headers;
globalThis.Request = globalThis.Request || abortController.Request;
globalThis.Response = globalThis.Response || abortController.Response;
globalThis.AbortController = globalThis.AbortController || abortController.AbortController;
