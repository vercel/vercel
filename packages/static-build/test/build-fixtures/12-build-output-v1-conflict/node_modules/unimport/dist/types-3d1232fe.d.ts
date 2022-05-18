declare const builtinPresets: {
    '@vue/composition-api': Preset;
    '@vueuse/core': () => Preset;
    '@vueuse/head': Preset;
    pinia: Preset;
    preact: Preset;
    quasar: Preset;
    react: Preset;
    'react-router': Preset;
    'react-router-dom': Preset;
    svelte: Preset;
    'svelte/animate': Preset;
    'svelte/easing': Preset;
    'svelte/motion': Preset;
    'svelte/store': Preset;
    'svelte/transition': Preset;
    'vee-validate': Preset;
    vitepress: Preset;
    'vue-demi': Preset;
    'vue-i18n': Preset;
    'vue-router': Preset;
    vue: Preset;
    'vue/macros': Preset;
    vuex: Preset;
    vitest: Preset;
    'uni-app': Preset;
    'solid-js': Preset;
    'solid-app-router': Preset;
};
declare type BuiltinPresetName = keyof typeof builtinPresets;

declare type ModuleId = string;
declare type ImportName = string;
interface ImportCommon {
    /** Module specifier to import from */
    from: ModuleId;
    /**
     * Priority of the import, if multiple imports have the same name, the one with the highest priority will be used
     * @default 1
     */
    priority?: number;
    /** If this import is disabled */
    disabled?: boolean;
}
interface Import extends ImportCommon {
    /** Import name to be detected */
    name: ImportName;
    /** Import as this name */
    as?: ImportName;
}
declare type PresetImport = ImportName | [name: ImportName, as?: ImportName, from?: ModuleId] | Exclude<Import, 'from'>;
interface Preset extends ImportCommon {
    imports: (PresetImport | Preset)[];
}
interface UnimportOptions {
    imports: Import[];
    presets: (Preset | BuiltinPresetName)[];
    warn: (msg: string) => void;
}
declare type PathFromResolver = (_import: Import) => string | undefined;
interface ScanDirExportsOptions {
    fileFilter?: (file: string) => boolean;
}
interface TypeDeclrationOptions {
    /**
     * Custom resolver for path of the import
     */
    resolvePath?: PathFromResolver;
    /**
     * Append `export {}` to the end of the file
     *
     * @default true
     */
    exportHelper?: boolean;
}

export { BuiltinPresetName as B, Import as I, ModuleId as M, Preset as P, ScanDirExportsOptions as S, TypeDeclrationOptions as T, UnimportOptions as U, ImportName as a, builtinPresets as b, ImportCommon as c, PresetImport as d, PathFromResolver as e };
