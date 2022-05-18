declare function translateOptions({ cache, cacheFile, cacheLocation, cacheStrategy, config, env, errorOnUnmatchedPattern, eslintrc, ext, fix, fixDryRun, fixType, global, ignore, ignorePath, ignorePattern, inlineConfig, parser, parserOptions, plugin, quiet, reportUnusedDisableDirectives, resolvePluginsRelativeTo, rule, rulesdir, }: any): {
    allowInlineConfig: any;
    cache: any;
    cacheLocation: any;
    cacheStrategy: any;
    errorOnUnmatchedPattern: any;
    extensions: any;
    fix: any;
    fixTypes: any;
    ignore: any;
    ignorePath: any;
    overrideConfig: {
        env: any;
        globals: any;
        ignorePatterns: any;
        parser: any;
        parserOptions: any;
        plugins: any;
        rules: any;
    };
    overrideConfigFile: any;
    reportUnusedDisableDirectives: string | undefined;
    resolvePluginsRelativeTo: any;
    rulePaths: any;
    useEslintrc: any;
};

export { translateOptions };
