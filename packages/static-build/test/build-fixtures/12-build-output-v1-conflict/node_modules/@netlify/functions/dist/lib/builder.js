"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.builder = void 0;
var is_promise_1 = __importDefault(require("is-promise"));
var consts_1 = require("./consts");
var augmentResponse = function (response) {
    var _a;
    if (!response || response.statusCode !== consts_1.HTTP_STATUS_OK) {
        return response;
    }
    var metadata = { version: consts_1.METADATA_VERSION, builder_function: consts_1.BUILDER_FUNCTIONS_FLAG, ttl: (_a = response.ttl) !== null && _a !== void 0 ? _a : 0 };
    return __assign(__assign({}, response), { metadata: metadata });
};
var wrapHandler = function (handler) {
    // eslint-disable-next-line promise/prefer-await-to-callbacks
    return function (event, context, callback) {
        if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
            return Promise.resolve({
                body: 'Method Not Allowed',
                statusCode: consts_1.HTTP_STATUS_METHOD_NOT_ALLOWED,
            });
        }
        // Removing query string parameters from the builder function.
        var modifiedEvent = __assign(__assign({}, event), { multiValueQueryStringParameters: {}, queryStringParameters: {} });
        // eslint-disable-next-line promise/prefer-await-to-callbacks
        var wrappedCallback = function (error, response) { return callback === null || callback === void 0 ? void 0 : callback(error, augmentResponse(response)); };
        var execution = handler(modifiedEvent, context, wrappedCallback);
        if ((0, is_promise_1.default)(execution)) {
            // eslint-disable-next-line promise/prefer-await-to-then
            return execution.then(augmentResponse);
        }
        return execution;
    };
};
exports.builder = wrapHandler;
