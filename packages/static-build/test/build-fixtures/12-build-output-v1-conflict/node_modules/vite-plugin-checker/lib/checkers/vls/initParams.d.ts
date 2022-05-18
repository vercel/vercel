import { URI } from 'vscode-uri';
import { InitializeParams } from 'vscode-languageserver/node';

declare type VlsOptions = ReturnType<typeof getDefaultVLSConfig>;
declare function getInitParams(workspaceUri: URI): InitializeParams;
declare function getDefaultVLSConfig(): {
    vetur: {
        ignoreProjectWarning: boolean;
        useWorkspaceDependencies: boolean;
        validation: {
            template: boolean;
            templateProps: boolean;
            interpolation: boolean;
            style: boolean;
            script: boolean;
        };
        completion: {
            autoImport: boolean;
            tagCasing: string;
            scaffoldSnippetSources: {
                workspace: string;
                user: string;
                vetur: string;
            };
        };
        grammar: {
            customBlocks: {};
        };
        format: {
            enable: boolean;
            options: {
                tabSize: number;
                useTabs: boolean;
            };
            defaultFormatter: {};
            defaultFormatterOptions: {};
            scriptInitialIndent: boolean;
            styleInitialIndent: boolean;
        };
        languageFeatures: {
            codeActions: boolean;
            updateImportOnFileMove: boolean;
            semanticTokens: boolean;
        };
        trace: {
            server: string;
        };
        dev: {
            vlsPath: string;
            vlsPort: number;
            logLevel: string;
        };
        experimental: {
            templateInterpolationService: boolean;
        };
    };
    css: {};
    html: {
        suggest: {};
    };
    javascript: {
        format: {};
    };
    typescript: {
        tsdk: null;
        format: {};
    };
    emmet: {};
    stylusSupremacy: {};
};

export { VlsOptions, getDefaultVLSConfig, getInitParams };
