const babel = require('@babel/core'); // eslint-disable-line @typescript-eslint/no-var-requires 
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pluginTransformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');

export function compile(
  filename: string,
  source: string
): { code: string; map: any } {
  return babel.transform(source, {
    filename,
    configFile: false,
    babelrc: false,
    highlightCode: false,
    compact: false,
    sourceType: 'module',
    sourceMaps: true,
    parserOpts: {
      plugins: [
        'asyncGenerators',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'optionalCatchBinding',
        'objectRestSpread',
        'numericSeparator',
        'dynamicImport',
        'importMeta',
      ],
    },
    plugins: [pluginTransformModulesCommonJs],
  });
}
