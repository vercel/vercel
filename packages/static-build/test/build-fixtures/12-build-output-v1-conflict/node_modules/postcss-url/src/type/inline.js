'use strict';

const processCopy = require('./copy');
const processRebase = require('./rebase');

const encodeFile = require('../lib/encode');
const getFile = require('../lib/get-file');

/**
 * @param {String} originUrl
 * @param {PostcssUrl~Dir} dir
 * @param {PostcssUrl~Option} options
 *
 * @returns {String|Undefined}
 */
function processFallback(originUrl, dir, options) {
    if (typeof options.fallback === 'function') {
        return options.fallback.apply(null, arguments);
    }
    switch (options.fallback) {
        case 'copy':
            return processCopy.apply(null, arguments);
        case 'rebase':
            return processRebase.apply(null, arguments);
        default:
            return Promise.resolve();
    }
}

const inlineProcess = (file, asset, warn, addDependency, options) => {
    const isSvg = file.mimeType === 'image/svg+xml';
    const defaultEncodeType = isSvg ? 'encodeURIComponent' : 'base64';
    const encodeType = options.encodeType || defaultEncodeType;

    // Warn for svg with hashes/fragments
    if (isSvg && asset.hash && !options.ignoreFragmentWarning) {
        // eslint-disable-next-line max-len
        warn(`Image type is svg and link contains #. Postcss-url cant handle svg fragments. SVG file fully inlined. ${file.path}`);
    }

    addDependency(file.path);

    const optimizeSvgEncode = isSvg && options.optimizeSvgEncode;
    const encodedStr = encodeFile(file, encodeType, optimizeSvgEncode);
    const resultValue = options.includeUriFragment && asset.hash
        ? encodedStr + asset.hash
        : encodedStr;

    // wrap url by quotes if percent-encoded svg
    return isSvg && encodeType !== 'base64' ? `"${resultValue}"` : resultValue;
};

/**
 * Inline image in url()
 *
 * @type {PostcssUrl~UrlProcessor}
 * @param {PostcssUrl~Asset} asset
 * @param {PostcssUrl~Dir} dir
 * @param {PostcssUrl~Options} options
 * @param {PostcssUrl~Decl} decl
 * @param {Function} warn
 * @param {Result} result
 * @param {Function} addDependency
 *
 * @returns {Promise<String|Undefined>}
 */
// eslint-disable-next-line complexity
module.exports = function(asset, dir, options, decl, warn, result, addDependency) {
    return getFile(asset, options, dir, warn)
        .then((file) => {
            if (!file) return;

            if (!file.mimeType) {
                warn(`Unable to find asset mime-type for ${file.path}`);

                return;
            }

            const maxSize = (options.maxSize || 0) * 1024;

            if (maxSize) {
                const size = Buffer.byteLength(file.contents);

                if (size >= maxSize) {
                    return processFallback.apply(this, arguments);
                }
            }

            return inlineProcess(file, asset, warn, addDependency, options);
        });
};
