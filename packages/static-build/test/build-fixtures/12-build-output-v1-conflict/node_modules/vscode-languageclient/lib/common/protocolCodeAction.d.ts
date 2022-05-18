import * as vscode from 'vscode';
export default class ProtocolCodeAction extends vscode.CodeAction {
    readonly data: unknown | undefined;
    constructor(title: string, data: unknown | undefined);
}
