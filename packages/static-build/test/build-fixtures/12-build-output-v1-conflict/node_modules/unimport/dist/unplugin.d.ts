import * as unplugin from 'unplugin';
import { FilterPattern } from '@rollup/pluginutils';
import { U as UnimportOptions } from './types-3d1232fe.js';

interface UnimportPluginOptions extends UnimportOptions {
    include: FilterPattern;
    exclude: FilterPattern;
    dts: boolean | string;
}
declare const _default: unplugin.UnpluginInstance<Partial<UnimportPluginOptions>>;

export { UnimportPluginOptions, _default as default };
