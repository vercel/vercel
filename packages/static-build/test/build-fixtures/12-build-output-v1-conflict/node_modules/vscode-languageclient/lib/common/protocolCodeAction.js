"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
class ProtocolCodeAction extends vscode.CodeAction {
    constructor(title, data) {
        super(title);
        this.data = data;
    }
}
exports.default = ProtocolCodeAction;
//# sourceMappingURL=protocolCodeAction.js.map