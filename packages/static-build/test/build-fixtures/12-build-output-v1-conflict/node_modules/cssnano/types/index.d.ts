export = cssnanoPlugin;
/**
 * @type {import('postcss').PluginCreator<Options>}
 * @param {Options=} options
 * @return {import('postcss').Plugin}
 */
declare function cssnanoPlugin(options?: Options | undefined): import('postcss').Plugin;
declare namespace cssnanoPlugin {
    export { postcss, Options };
}
type Options = {
    preset?: any;
    plugins?: any[];
    configFile?: string;
};
declare var postcss: true;
