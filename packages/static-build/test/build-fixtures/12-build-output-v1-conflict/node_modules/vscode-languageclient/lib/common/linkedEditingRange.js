"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
/// <reference path="../../typings/vscode-proposed.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkedEditingFeature = void 0;
const code = require("vscode");
const proto = require("vscode-languageserver-protocol");
const client_1 = require("./client");
function ensure(target, key) {
    if (target[key] === void 0) {
        target[key] = {};
    }
    return target[key];
}
class LinkedEditingFeature extends client_1.TextDocumentFeature {
    constructor(client) {
        super(client, proto.LinkedEditingRangeRequest.type);
    }
    fillClientCapabilities(capabilities) {
        const linkedEditingSupport = ensure(ensure(capabilities, 'textDocument'), 'linkedEditingRange');
        linkedEditingSupport.dynamicRegistration = true;
    }
    initialize(capabilities, documentSelector) {
        let [id, options] = this.getRegistration(documentSelector, capabilities.linkedEditingRangeProvider);
        if (!id || !options) {
            return;
        }
        this.register({ id: id, registerOptions: options });
    }
    registerLanguageProvider(options) {
        const provider = {
            provideLinkedEditingRanges: (document, position, token) => {
                const client = this._client;
                const provideLinkedEditing = (document, position, token) => {
                    return client.sendRequest(proto.LinkedEditingRangeRequest.type, client.code2ProtocolConverter.asTextDocumentPositionParams(document, position), token).then(client.protocol2CodeConverter.asLinkedEditingRanges, (error) => {
                        return client.handleFailedRequest(proto.LinkedEditingRangeRequest.type, error, null);
                    });
                };
                const middleware = client.clientOptions.middleware;
                return middleware.provideLinkedEditingRange
                    ? middleware.provideLinkedEditingRange(document, position, token, provideLinkedEditing)
                    : provideLinkedEditing(document, position, token);
            }
        };
        return [code.languages.registerLinkedEditingRangeProvider(options.documentSelector, provider), provider];
    }
}
exports.LinkedEditingFeature = LinkedEditingFeature;
//# sourceMappingURL=linkedEditingRange.js.map