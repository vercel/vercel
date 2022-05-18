"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanguageClient = void 0;
const api_1 = require("../common/api");
const browser_1 = require("vscode-languageserver-protocol/browser");
__exportStar(require("vscode-languageserver-protocol/browser"), exports);
__exportStar(require("../common/api"), exports);
class LanguageClient extends api_1.CommonLanguageClient {
    constructor(id, name, clientOptions, worker) {
        super(id, name, clientOptions);
        this.worker = worker;
    }
    createMessageTransports(_encoding) {
        const reader = new browser_1.BrowserMessageReader(this.worker);
        const writer = new browser_1.BrowserMessageWriter(this.worker);
        return Promise.resolve({ reader, writer });
    }
    getLocale() {
        // ToDo: need to find a way to let the locale
        // travel to the worker extension host.
        return 'en';
    }
}
exports.LanguageClient = LanguageClient;
//# sourceMappingURL=main.js.map