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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSecrets = void 0;
var buffer_1 = require("buffer");
var https_1 = require("https");
var process_1 = require("process");
var services = {
    gitHub: null,
    spotify: null,
    salesforce: null,
    stripe: null,
};
var siteId = process_1.env.SITE_ID;
var camelize = function (text) {
    var safe = text.replace(/[-_\s.]+(.)?/g, function (_, sub) { return (sub ? sub.toUpperCase() : ''); });
    return safe.slice(0, 1).toLowerCase() + safe.slice(1);
};
// The services will be camelized versions of the OneGraph service enums
// unless overridden by the serviceNormalizeOverrides object
var serviceNormalizeOverrides = {
    // Keys are the OneGraph service enums, values are the desired `secret.<service>` names
    GITHUB: 'gitHub',
};
var oneGraphRequest = function (secretToken, requestBody) {
    return new Promise(function (resolve, reject) {
        var port = 443;
        var options = {
            host: 'serve.onegraph.com',
            path: "/graphql?app_id=".concat(siteId),
            port: port,
            method: 'POST',
            headers: {
                Authorization: "Bearer ".concat(secretToken),
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'Content-Length': requestBody ? buffer_1.Buffer.byteLength(requestBody) : 0,
            },
        };
        var req = (0, https_1.request)(options, function (res) {
            if (res.statusCode !== 200) {
                return reject(new Error(String(res.statusCode)));
            }
            var body = [];
            res.on('data', function (chunk) {
                body.push(chunk);
            });
            res.on('end', function () {
                var data = buffer_1.Buffer.concat(body).toString();
                try {
                    var result = JSON.parse(data);
                    resolve(result);
                }
                catch (error) {
                    reject(error);
                }
            });
        });
        req.on('error', function (error) {
            reject(error);
        });
        req.write(requestBody);
        req.end();
    });
};
var formatSecrets = function (result) {
    var _a, _b, _c;
    var responseServices = (_c = (_b = (_a = result === null || result === void 0 ? void 0 : result.data) === null || _a === void 0 ? void 0 : _a.me) === null || _b === void 0 ? void 0 : _b.serviceMetadata) === null || _c === void 0 ? void 0 : _c.loggedInServices;
    if (!responseServices) {
        return {};
    }
    var newSecrets = responseServices.reduce(function (acc, service) {
        var _a;
        var normalized = serviceNormalizeOverrides[service.service] || camelize(service.friendlyServiceName);
        return __assign(__assign({}, acc), (_a = {}, _a[normalized] = service, _a));
    }, {});
    return newSecrets;
};
// Note: We may want to have configurable "sets" of secrets,
// e.g. "dev" and "prod"
var getSecrets = function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var eventToken, secretToken, doc, body, result, newSecrets;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                eventToken = (_a = event) === null || _a === void 0 ? void 0 : _a.authlifyToken;
                secretToken = eventToken || process_1.env.ONEGRAPH_AUTHLIFY_TOKEN;
                if (!secretToken) {
                    return [2 /*return*/, {}];
                }
                doc = "query FindLoggedInServicesQuery {\n    me {\n      serviceMetadata {\n        loggedInServices {\n          friendlyServiceName\n          service\n          isLoggedIn\n          bearerToken\n          grantedScopes {\n            scope\n            scopeInfo {\n              category\n              scope\n              display\n              isDefault\n              isRequired\n              description\n              title\n            }\n          }\n        }\n      }\n    }\n  }";
                body = JSON.stringify({ query: doc });
                return [4 /*yield*/, oneGraphRequest(secretToken, new TextEncoder().encode(body))];
            case 1:
                result = _b.sent();
                newSecrets = formatSecrets(result);
                return [2 /*return*/, newSecrets];
        }
    });
}); };
exports.getSecrets = getSecrets;
