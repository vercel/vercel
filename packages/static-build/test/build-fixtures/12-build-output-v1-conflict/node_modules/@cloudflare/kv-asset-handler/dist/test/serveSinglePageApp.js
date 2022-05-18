"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = require("ava");
const mocks_1 = require("../mocks");
(0, mocks_1.mockGlobalScope)();
const index_1 = require("../index");
function testRequest(path) {
    (0, mocks_1.mockRequestScope)();
    let url = new URL('https://example.com');
    url.pathname = path;
    let request = new Request(url.toString());
    return request;
}
(0, ava_1.default)('serveSinglePageApp returns root asset path when request path ends in .html', async (t) => {
    let path = '/foo/thing.html';
    let request = testRequest(path);
    let expected_request = testRequest('/index.html');
    let actual_request = (0, index_1.serveSinglePageApp)(request);
    t.deepEqual(expected_request, actual_request);
});
(0, ava_1.default)('serveSinglePageApp returns root asset path when request path does not have extension', async (t) => {
    let path = '/foo/thing';
    let request = testRequest(path);
    let expected_request = testRequest('/index.html');
    let actual_request = (0, index_1.serveSinglePageApp)(request);
    t.deepEqual(expected_request, actual_request);
});
(0, ava_1.default)('serveSinglePageApp returns requested asset when request path has non-html extension', async (t) => {
    let path = '/foo/thing.js';
    let request = testRequest(path);
    let expected_request = request;
    let actual_request = (0, index_1.serveSinglePageApp)(request);
    t.deepEqual(expected_request, actual_request);
});
