'use strict';

const path = require('path');
const url = require('url');

/**
 * Normalazing result url, before replace decl value
 *
 * @param {String} assetUrl
 * @returns {String}
 */
const normalize = (assetUrl) => {
    assetUrl = path.normalize(assetUrl);

    return path.sep === '\\' ? assetUrl.replace(/\\/g, '\/') : assetUrl;
};

/**
 * @param {String} assetUrl
 * @returns {Boolean}
 */
const isUrlWithoutPathname = (assetUrl) => {
    return assetUrl[0] === '#'
        || assetUrl.indexOf('%23') === 0
        || assetUrl.indexOf('data:') === 0
        || /^[a-z]+:\/\//.test(assetUrl)
        || /^\/\//.test(assetUrl);
};

/**
 * Check if url is absolute, hash or data-uri
 *
 * @param {String} assetUrl
 * @param {PostcssUrl~Options} options
 * @returns {Boolean}
 */
const isUrlShouldBeIgnored = (assetUrl, options) => {
    const isAbsolutePath = assetUrl[0] === '/';
    const isStartsWithTilde = assetUrl[0] === '~';

    return isUrlWithoutPathname(assetUrl) || ((isAbsolutePath || isStartsWithTilde) && !options.basePath);
};

/**
 * @param {String} baseDir - absolute target path
 * @param {String} assetsPath - extend asset path, can be absolute path
 * @param {String} relative - current relative asset path
 * @returns {String}
 */
const getAssetsPath = (baseDir, assetsPath, relative) =>
    path.resolve(baseDir, assetsPath || '', relative || '');

/**
 * Target path, output base dir
 *
 * @param {Dir} dir
 * @returns {String}
 */
const getTargetDir = (dir) =>
    dir.to != null ? dir.to : process.cwd();

/**
 * Stylesheet file path from decl
 *
 * @param {Decl} decl
 * @returns {String}
 */
const getPathDeclFile = (decl) =>
    decl.source && decl.source.input && decl.source.input.file;

/**
 * Stylesheet file dir from decl
 *
 * @param {Decl} decl
 * @returns {String}
 */
const getDirDeclFile = (decl) => {
    const filename = getPathDeclFile(decl);

    return filename ? path.dirname(filename) : process.cwd();
};

/**
 * Returns paths list, where we can find assets file
 *
 * @param {String[]|String} basePath - base paths where trying search to assets file
 * @param {Dir} dirFrom
 * @param {String} relPath - relative asset path
 * @returns {String[]}
 */
const getPathByBasePath = (basePath, dirFrom, relPath) => {
    if (relPath[0] === '/') {
        relPath = `.${relPath}`;
    }

    basePath = !Array.isArray(basePath) ? [basePath] : basePath;

    return basePath.map((pathItem) =>
        getAssetsPath(dirFrom, pathItem, relPath)
    );
};

/**
 * Preparing asset paths and data
 *
 * @param {String} assetUrl
 * @param {PostcssUrl~Dir} dir
 * @param {Decl} decl
 * @returns {PostcssUrl~Asset}
 */
const prepareAsset = (assetUrl, dir, decl) => {
    const parsedUrl = url.parse(assetUrl);
    const pathname = !isUrlWithoutPathname(assetUrl) ? parsedUrl.pathname : null;
    const absolutePath = pathname
        ? path.resolve(path.join(dir.file, pathname))
        : getPathDeclFile(decl);

    return {
        url: assetUrl,
        originUrl: assetUrl,
        pathname,
        absolutePath: absolutePath || dir.from,
        relativePath: absolutePath ? path.relative(dir.from, absolutePath) : '.',
        search: (parsedUrl.search || ''),
        hash: (parsedUrl.hash || '')
    };
};

module.exports = {
    normalize,
    prepareAsset,
    getAssetsPath,
    getDirDeclFile,
    getPathDeclFile,
    getTargetDir,
    getPathByBasePath,
    isUrlShouldBeIgnored
};

/**
 * @typedef {Object} PostcssUrl~Asset
 * @property {String} url - origin asset url
 * @property {String} name - parsed asset filename
 * @property {String} absolutePath - absolute asset path
 * @property {String} relativePath - relative asset path (relative to target dir)
 * @property {String} search - search from url, ex. ?query=1
 * @property {String} hash - hash from url
 */

/**
 * @typedef {Object} PostcssUrl~Dir
 * @property {String} from - dirname from postcss option 'from'
 * @property {String} to - dirname from postcss option 'to'
 * @property {String} file - decl file dirname (css file)
 */
