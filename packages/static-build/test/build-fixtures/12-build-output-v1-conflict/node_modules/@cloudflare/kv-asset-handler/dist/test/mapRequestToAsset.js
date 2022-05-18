"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = require("ava");
const mocks_1 = require("../mocks");
(0, mocks_1.mockGlobalScope)();
const index_1 = require("../index");
(0, ava_1.default)('mapRequestToAsset() correctly changes /about -> /about/index.html', async (t) => {
    (0, mocks_1.mockRequestScope)();
    let path = '/about';
    let request = new Request(`https://foo.com${path}`);
    let newRequest = (0, index_1.mapRequestToAsset)(request);
    t.is(newRequest.url, request.url + '/index.html');
});
(0, ava_1.default)('mapRequestToAsset() correctly changes /about/ -> /about/index.html', async (t) => {
    (0, mocks_1.mockRequestScope)();
    let path = '/about/';
    let request = new Request(`https://foo.com${path}`);
    let newRequest = (0, index_1.mapRequestToAsset)(request);
    t.is(newRequest.url, request.url + 'index.html');
});
(0, ava_1.default)('mapRequestToAsset() correctly changes /about.me/ -> /about.me/index.html', async (t) => {
    (0, mocks_1.mockRequestScope)();
    let path = '/about.me/';
    let request = new Request(`https://foo.com${path}`);
    let newRequest = (0, index_1.mapRequestToAsset)(request);
    t.is(newRequest.url, request.url + 'index.html');
});
(0, ava_1.default)('mapRequestToAsset() correctly changes /about -> /about/default.html', async (t) => {
    (0, mocks_1.mockRequestScope)();
    let path = '/about';
    let request = new Request(`https://foo.com${path}`);
    let newRequest = (0, index_1.mapRequestToAsset)(request, { defaultDocument: 'default.html' });
    t.is(newRequest.url, request.url + '/default.html');
});
