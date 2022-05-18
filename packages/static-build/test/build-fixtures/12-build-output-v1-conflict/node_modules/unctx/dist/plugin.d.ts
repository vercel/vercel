import * as unplugin from 'unplugin';
import { TransformerOptions } from './transform.js';
import 'magic-string';

interface UnctxPluginOptions extends TransformerOptions {
    transformInclude?: (id: string) => boolean;
}
declare const unctxPlugin: unplugin.UnpluginInstance<UnctxPluginOptions>;

export { UnctxPluginOptions, unctxPlugin };
