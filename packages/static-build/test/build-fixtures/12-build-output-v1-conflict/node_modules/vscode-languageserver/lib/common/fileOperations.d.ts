import { RequestHandler, NotificationHandler, WorkspaceEdit, CreateFilesParams, RenameFilesParams, DeleteFilesParams } from 'vscode-languageserver-protocol';
import type { Feature, _RemoteWorkspace } from './server';
/**
 * Shape of the file operations feature
 *
 * @since 3.16.0
 */
export interface FileOperationsFeatureShape {
    onDidCreateFiles(handler: NotificationHandler<CreateFilesParams>): void;
    onDidRenameFiles(handler: NotificationHandler<RenameFilesParams>): void;
    onDidDeleteFiles(handler: NotificationHandler<DeleteFilesParams>): void;
    onWillCreateFiles(handler: RequestHandler<CreateFilesParams, WorkspaceEdit | null, never>): void;
    onWillRenameFiles(handler: RequestHandler<RenameFilesParams, WorkspaceEdit | null, never>): void;
    onWillDeleteFiles(handler: RequestHandler<DeleteFilesParams, WorkspaceEdit | null, never>): void;
}
export declare const FileOperationsFeature: Feature<_RemoteWorkspace, FileOperationsFeatureShape>;
