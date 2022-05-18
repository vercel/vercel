"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = require("ava");
const mocks_1 = require("../mocks");
(0, mocks_1.mockGlobalScope)();
// manually reset manifest global, to test optional behaviour
Object.assign(global, { __STATIC_CONTENT_MANIFEST: undefined });
const index_1 = require("../index");
(0, ava_1.default)('getAssetFromKV return correct val from KV without manifest', async (t) => {
    (0, mocks_1.mockRequestScope)();
    // manually reset manifest global, to test optional behaviour
    Object.assign(global, { __STATIC_CONTENT_MANIFEST: undefined });
    const event = (0, mocks_1.getEvent)(new Request('https://blah.com/key1.123HASHBROWN.txt'));
    const res = await (0, index_1.getAssetFromKV)(event);
    if (res) {
        t.is(await res.text(), 'val1');
        t.true(res.headers.get('content-type').includes('text'));
    }
    else {
        t.fail('Response was undefined');
    }
});
