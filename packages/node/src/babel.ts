import babel from '@babel/core';
// import pluginTransformModulesCommonJs from '@babel/plugin-transform-modules-commonjs';

export function compile(filename: string, source: string) {
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
    // plugins: [pluginTransformModulesCommonJs],
  });
}
