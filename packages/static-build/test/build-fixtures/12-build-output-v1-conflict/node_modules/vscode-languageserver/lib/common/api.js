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
exports.ProposedFeatures = exports.SemanticTokensBuilder = void 0;
const semanticTokens_1 = require("./semanticTokens");
Object.defineProperty(exports, "SemanticTokensBuilder", { enumerable: true, get: function () { return semanticTokens_1.SemanticTokensBuilder; } });
__exportStar(require("vscode-languageserver-protocol/"), exports);
__exportStar(require("./server"), exports);
var ProposedFeatures;
(function (ProposedFeatures) {
    ProposedFeatures.all = {
        __brand: 'features'
    };
})(ProposedFeatures = exports.ProposedFeatures || (exports.ProposedFeatures = {}));
//# sourceMappingURL=api.js.map