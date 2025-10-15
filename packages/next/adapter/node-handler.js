"use strict";
/**
 * NOTE: THIS FILE CANNOT USE IMPORTS OUTSIDE OF THE FUNCTION
 * AS IT NEEDS TO BE STRINGIFIED entirely together
 */
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
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHandlerSource = void 0;
var getHandlerSource = function (ctx) {
    return "module.exports = (".concat((function () {
        var path = require('path');
        globalThis.AsyncLocalStorage = require('async_hooks').AsyncLocalStorage;
        var relativeDistDir = process.env.__PRIVATE_RELATIVE_DIST_DIR;
        // - we need to process dynamic routes for matching
        // - we need to normalize _next/data, .rsc, segment prefetch to match
        // - we need this handler to be deterministic for all lambdas so it
        // can allow function de-duping
        // - we do not need to handle rewrites as matched-path comes after
        // we use the routes from the manifest as it is filtered to
        // only include the dynamic routes in that specific
        // function after de-duping at infra level
        var _a = require('./' + path.posix.join(relativeDistDir, 'routes-manifest.json')), dynamicRoutesRaw = _a.dynamicRoutes, staticRoutesRaw = _a.staticRoutes;
        var hydrateRoutesManifestItem = function (item) {
            return __assign(__assign({}, item), { regex: new RegExp(item.regex) });
        };
        var dynamicRoutes = dynamicRoutesRaw.map(hydrateRoutesManifestItem);
        var staticRoutes = staticRoutesRaw.map(hydrateRoutesManifestItem);
        // maps un-normalized to normalized app path
        // e.g. /hello/(foo)/page -> /hello
        var appPathRoutesManifest = require('./' + path.posix.join(relativeDistDir, 'app-path-routes-manifest.json'));
        var inversedAppRoutesManifest = Object.entries(appPathRoutesManifest).reduce(function (manifest, _a) {
            var originalKey = _a[0], normalizedKey = _a[1];
            manifest[normalizedKey] = originalKey;
            return manifest;
        }, {});
        function normalizeDataPath(pathname) {
            if (!(pathname || '/').startsWith('/_next/data')) {
                return pathname;
            }
            pathname = pathname
                .replace(/\/_next\/data\/[^/]{1,}/, '')
                .replace(/\.json$/, '');
            if (pathname === '/index') {
                return '/';
            }
            return pathname;
        }
        function matchUrlToPage(urlPathname) {
            // normalize first
            urlPathname = normalizeDataPath(urlPathname);
            console.log('before normalize', urlPathname);
            for (var _i = 0, _a = [
                /\.segments(\/.*)\.segment\.rsc$/,
                /\.prefetch\.rsc$/,
                /\.rsc$/,
            ]; _i < _a.length; _i++) {
                var suffixRegex = _a[_i];
                urlPathname = urlPathname.replace(suffixRegex, '');
            }
            console.log('after normalize', urlPathname);
            var getPathnameNoSlash = function (urlPathname) {
                return urlPathname.replace(/\/$/, '') || '/';
            };
            // check static routes
            for (var _b = 0, _c = __spreadArray(__spreadArray([], staticRoutes, true), dynamicRoutes, true); _b < _c.length; _b++) {
                var route = _c[_b];
                if (route.regex.test(urlPathname)) {
                    console.log('matched route', route, urlPathname);
                    return inversedAppRoutesManifest[route.page] || route.page;
                }
            }
            // we should have matched above but if not return back
            var pathnameNoSlash = getPathnameNoSlash(urlPathname);
            return inversedAppRoutesManifest[pathnameNoSlash] || pathnameNoSlash;
        }
        var SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
        function getRequestContext() {
            var _a, _b, _c;
            var fromSymbol = globalThis;
            return (_c = (_b = (_a = fromSymbol[SYMBOL_FOR_REQ_CONTEXT]) === null || _a === void 0 ? void 0 : _a.get) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : {};
        }
        return function handler(req, res) {
            return __awaiter(this, void 0, void 0, function () {
                var urlPathname, parsedUrl, page, isAppDir, mod, error_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            urlPathname = req.headers['x-matched-path'];
                            if (typeof urlPathname !== 'string') {
                                parsedUrl = new URL(req.url || '/', 'http://n');
                                urlPathname = parsedUrl.pathname || '/';
                            }
                            page = matchUrlToPage(urlPathname);
                            isAppDir = page.match(/\/(page|route)$/);
                            mod = require('./' +
                                path.posix.join(relativeDistDir, 'server', isAppDir ? 'app' : 'pages', "".concat(page, ".js")));
                            return [4 /*yield*/, mod.handler(req, res, {
                                    waitUntil: getRequestContext().waitUntil,
                                })];
                        case 1:
                            _a.sent();
                            return [3 /*break*/, 3];
                        case 2:
                            error_1 = _a.sent();
                            console.error("Failed to handle ".concat(req.url), error_1);
                            // If error bubbled to this point crash the function to
                            // prevent attempting to re-use in bad state
                            process.exit(1);
                            return [3 /*break*/, 3];
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
    }).toString(), ")()").replace('process.env.__PRIVATE_RELATIVE_DIST_DIR', "\"".concat(ctx.projectRelativeDistDir, "\""));
};
exports.getHandlerSource = getHandlerSource;
