import * as code from 'vscode';
import * as proto from 'vscode-languageserver-protocol';
export default class ProtocolCompletionItem extends code.CompletionItem {
    data: any;
    fromEdit: boolean | undefined;
    documentationFormat: string | undefined;
    originalItemKind: proto.CompletionItemKind | undefined;
    deprecated: boolean | undefined;
    insertTextMode: proto.InsertTextMode | undefined;
    constructor(label: string);
}
