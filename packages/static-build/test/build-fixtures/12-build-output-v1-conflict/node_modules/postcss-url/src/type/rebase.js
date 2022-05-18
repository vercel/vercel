'use strict';

const path = require('path');
const paths = require('../lib/paths');
const normalize = paths.normalize;
const getAssetsPath = paths.getAssetsPath;

/**
 * Fix url() according to source (`from`) or destination (`to`)
 *
 * @type {PostcssUrl~UrlProcessor}
 * @param {PostcssUrl~Asset} asset
 * @param {PostcssUrl~Dir} dir
 * @param {PostcssUrl~Option} options
 *
 * @returns {Promise<String>}
 */
module.exports = function(asset, dir, options) {
    const dest = getAssetsPath(dir.to, options && options.assetsPath || '');
    const rebasedUrl = normalize(
        path.relative(dest, asset.absolutePath)
    );

    return Promise.resolve().then(() => `${rebasedUrl}${asset.search}${asset.hash}`);
};
