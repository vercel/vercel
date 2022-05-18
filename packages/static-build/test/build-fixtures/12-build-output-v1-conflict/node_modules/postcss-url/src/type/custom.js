/**
 * Transform url() based on a custom callback
 *
 * @type {PostcssUrl~UrlProcessor}
 * @param {PostcssUrl~Asset} asset
 * @param {PostcssUrl~Dir} dir
 * @param {PostcssUrl~Option} options
 *
 * @returns {Promise<String|Undefined>}
 */
module.exports = function getCustomProcessor(asset, dir, options) {
    return Promise.resolve().then(() => options.url.apply(null, arguments));
};
