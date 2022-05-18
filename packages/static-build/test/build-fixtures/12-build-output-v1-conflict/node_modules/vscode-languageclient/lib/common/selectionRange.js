"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelectionRangeFeature = void 0;
const vscode_1 = require("vscode");
const vscode_languageserver_protocol_1 = require("vscode-languageserver-protocol");
const client_1 = require("./client");
function ensure(target, key) {
    if (target[key] === void 0) {
        target[key] = Object.create(null);
    }
    return target[key];
}
class SelectionRangeFeature extends client_1.TextDocumentFeature {
    constructor(client) {
        super(client, vscode_languageserver_protocol_1.SelectionRangeRequest.type);
    }
    fillClientCapabilities(capabilities) {
        let capability = ensure(ensure(capabilities, 'textDocument'), 'selectionRange');
        capability.dynamicRegistration = true;
    }
    initialize(capabilities, documentSelector) {
        let [id, options] = this.getRegistration(documentSelector, capabilities.selectionRangeProvider);
        if (!id || !options) {
            return;
        }
        this.register({ id: id, registerOptions: options });
    }
    registerLanguageProvider(options) {
        const provider = {
            provideSelectionRanges: (document, positions, token) => {
                const client = this._client;
                const provideSelectionRanges = (document, positions, token) => {
                    const requestParams = {
                        textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document),
                        positions: client.code2ProtocolConverter.asPositions(positions)
                    };
                    return client.sendRequest(vscode_languageserver_protocol_1.SelectionRangeRequest.type, requestParams, token).then((ranges) => client.protocol2CodeConverter.asSelectionRanges(ranges), (error) => {
                        return client.handleFailedRequest(vscode_languageserver_protocol_1.SelectionRangeRequest.type, error, null);
                    });
                };
                const middleware = client.clientOptions.middleware;
                return middleware.provideSelectionRanges
                    ? middleware.provideSelectionRanges(document, positions, token, provideSelectionRanges)
                    : provideSelectionRanges(document, positions, token);
            }
        };
        return [vscode_1.languages.registerSelectionRangeProvider(options.documentSelector, provider), provider];
    }
}
exports.SelectionRangeFeature = SelectionRangeFeature;
//# sourceMappingURL=selectionRange.js.map